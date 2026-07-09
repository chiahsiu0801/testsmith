import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import type { CoverageEntry } from './coverage.js';

/**
 * I/O layer for the coverage signal (SPEC §4.1.4): locate the project's existing
 * `coverage-final.json` if present, otherwise run the suite once with coverage, and
 * hand a normalized {@link CoverageEntry} list to the pure {@link ./coverage} core —
 * the same pure-core / thin-walker split as {@link ./churn} ↔ {@link ./gitLog} and
 * {@link ./fanIn} ↔ {@link ./importGraph}. All report location, running, parsing,
 * and path rebasing live here; all line-coverage policy lives in the pure core.
 *
 * Design choices pinned in docs/adr/0005:
 *  - Read istanbul-shape `coverage/coverage-final.json` (Vitest's DEFAULT `json`
 *    reporter), and produce the same artifact when we must run — one format both ways.
 *  - "Present" means USABLE: exists, parses, and has ≥1 entry. A missing, corrupt, or
 *    empty report all fall through to the single run (acceptance #3), which happens in
 *    exactly one place so it can never fire twice.
 *  - The run forces `--coverage.all` so untested candidates carry real line totals
 *    (an honest, candidate-scoped baseline), reporter `json`, and a TEMP reports dir
 *    so we never write into the user's `coverage/` (the never-destructive invariant).
 *  - Success is judged by "did the report appear", not the exit code: Vitest still
 *    writes coverage when tests FAIL, so a red suite yields a usable (if warned)
 *    baseline; only a missing report degrades.
 *
 * Never fatal: a missing provider, a failed run, or an unreadable report yields
 * `{ entries: [], warning }`, so coverage degrades to all-zeros rather than crashing
 * (acceptance #2) — exactly like {@link ./gitLog}'s churn degradation.
 */

/** dependency-cruiser/istanbul emit OS-native separators; match the scanned set. */
const toPosix = (p: string): string => p.split('\\').join('/');

/** Outcome of one coverage run, abstracted so tests can inject a stub for the
 *  read-vs-run decision (acceptance #3) without spawning Vitest. */
export interface RunSuiteResult {
  /** Path to the produced `coverage-final.json`, or null if none was produced. */
  reportPath: string | null;
  /** True if the suite exited non-zero (e.g. failing tests) — it may still have
   *  emitted coverage, so this only drives the flaky-baseline warning. */
  failed: boolean;
}

export type RunSuite = (projectRoot: string, sourceRoot: string) => Promise<RunSuiteResult>;

export interface CoverageReadResult {
  /** Normalized, project-root-relative entries for the pure core. Empty on degrade. */
  entries: CoverageEntry[];
  /** True iff a coverage run was invoked (false when an existing report was used).
   *  Makes the single-run guarantee observable to tests. */
  ranSuite: boolean;
  /** Present when coverage could not be measured, or the baseline is suspect. */
  warning?: string;
}

/**
 * Parse an istanbul `coverage-final.json` at `reportPath` into normalized entries,
 * or null if the file is absent, unparseable, or empty. Absolute per-file keys are
 * rebased to project-root-relative POSIX (using `projectRoot` exactly as passed, to
 * match {@link enumerateSources}'s fast-glob keys) so they join onto the scanned set —
 * the same keying discipline as churn and fan-in.
 */
async function parseReport(
  reportPath: string,
  projectRoot: string,
): Promise<CoverageEntry[] | null> {
  if (!existsSync(reportPath)) return null;

  let json: unknown;
  try {
    json = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;

  const entries: CoverageEntry[] = [];
  for (const value of Object.values(json as Record<string, unknown>)) {
    const v = value as Partial<CoverageEntry> & { path?: unknown };
    if (!v || typeof v !== 'object' || !v.statementMap || !v.s) continue;
    const abs = typeof v.path === 'string' ? v.path : null;
    if (!abs) continue;
    entries.push({
      path: toPosix(relative(projectRoot, resolve(abs))),
      statementMap: v.statementMap,
      s: v.s,
    });
  }
  return entries.length > 0 ? entries : null;
}

/**
 * Default runner: `npx vitest run` with forced coverage flags into an OS temp dir,
 * so the project's own `coverage/` is never touched. Reporter and `all` are forced
 * regardless of the project's config; the provider is NOT forced (a project set up
 * for istanbul keeps istanbul). `error`/non-zero exit both resolve — the caller
 * judges success by whether the report file appeared.
 */
async function defaultRunSuite(projectRoot: string, sourceRoot: string): Promise<RunSuiteResult> {
  const outDir = await mkdtemp(join(tmpdir(), 'testsmith-cov-'));
  const args = [
    'vitest',
    'run',
    '--coverage.enabled=true',
    '--coverage.reporter=json',
    '--coverage.all=true',
    `--coverage.reportsDirectory=${outDir}`,
    `--coverage.include=${toPosix(sourceRoot)}/**`,
  ];

  const failed = await new Promise<boolean>((resolveRun) => {
    const child = spawn('npx', args, {
      cwd: projectRoot,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    });
    child.on('error', () => resolveRun(true));
    child.on('close', (code) => resolveRun(code !== 0));
  });

  const reportPath = join(outDir, 'coverage-final.json');
  return { reportPath: existsSync(reportPath) ? reportPath : null, failed };
}

export async function readCoverage(
  projectRoot: string,
  sourceRoot: string,
  runSuite: RunSuite = defaultRunSuite,
): Promise<CoverageReadResult> {
  // Existing report present and usable → use it, no run (acceptance #3).
  const existing = await parseReport(join(projectRoot, 'coverage', 'coverage-final.json'), projectRoot);
  if (existing) return { entries: existing, ranSuite: false };

  // Missing/corrupt/empty → run the suite exactly once.
  let run: RunSuiteResult;
  try {
    run = await runSuite(projectRoot, sourceRoot);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      entries: [],
      ranSuite: true,
      warning: `could not run the test suite for coverage — coverage scored as 0 (${detail}).`,
    };
  }

  if (!run.reportPath) {
    return {
      entries: [],
      ranSuite: true,
      warning:
        'coverage run produced no report — coverage scored as 0 ' +
        '(is a @vitest/coverage-v8 or -istanbul provider installed?).',
    };
  }

  const parsed = await parseReport(run.reportPath, projectRoot);
  if (!parsed) {
    return {
      entries: [],
      ranSuite: true,
      warning: 'coverage report was unreadable after the run — coverage scored as 0.',
    };
  }

  return {
    entries: parsed,
    ranSuite: true,
    warning: run.failed
      ? 'the existing test suite has failing tests — the coverage baseline may be unreliable.'
      : undefined,
  };
}
