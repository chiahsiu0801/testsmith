import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { readCoverage, type RunSuite } from '../src/scan/coverageReport.js';
import { computeCoverage } from '../src/scan/coverage.js';

/**
 * End-to-end acceptance for the coverage I/O layer (docs/adr/0005, acceptance
 * #1/#2/#3): locating and parsing an on-disk `coverage-final.json`, rebasing its
 * absolute keys to project-root-relative POSIX so they join onto the scanned set,
 * the read-vs-run decision (exactly ONE run on the missing/corrupt path, ZERO when a
 * report is present), and never-fatal degradation. The pure line rule is covered
 * exhaustively in coverage.test.ts. The run is stubbed via the injectable `runSuite`
 * so these stay deterministic and provider-free.
 */

/** One istanbul file entry from `[line, hits]` statement pairs, keyed by abs path. */
const fileCov = (abs: string, statements: Array<[line: number, hits: number]>) => {
  const statementMap: Record<string, { start: { line: number }; end: { line: number } }> = {};
  const s: Record<string, number> = {};
  statements.forEach(([line, hits], i) => {
    statementMap[i] = { start: { line }, end: { line } };
    s[i] = hits;
  });
  return { path: abs, statementMap, s };
};

/** A full coverage-final.json string keyed by absolute path under `root`. */
const reportJson = (
  root: string,
  files: Record<string, Array<[line: number, hits: number]>>,
): string => {
  const report: Record<string, unknown> = {};
  for (const [rel, statements] of Object.entries(files)) {
    const abs = join(root, rel);
    report[abs] = fileCov(abs, statements);
  }
  return JSON.stringify(report);
};

/** A runSuite stub that writes `files` to a temp report and reports it, counting calls. */
async function stubRun(root: string, files: Record<string, Array<[number, number]>>, failed = false) {
  const outDir = await mkdtemp(join(tmpdir(), 'testsmith-covrun-'));
  const reportPath = join(outDir, 'coverage-final.json');
  await writeFile(reportPath, reportJson(root, files));
  const run: RunSuite = vi.fn(async () => ({ reportPath, failed }));
  return { run, outDir };
}

describe('readCoverage — an existing report is read without running', () => {
  let root: string;
  const candidates = ['src/covered.ts', 'src/partial.ts', 'src/orphan.ts'];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'testsmith-cov-existing-'));
    await mkdir(join(root, 'coverage'), { recursive: true });
    // orphan.ts is a candidate but ABSENT from the report → untested → 0.
    await writeFile(
      join(root, 'coverage', 'coverage-final.json'),
      reportJson(root, {
        'src/covered.ts': [[1, 1], [2, 1]],
        'src/partial.ts': [[1, 1], [2, 0]],
      }),
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('rebases keys onto the scanned set, seeds the absent candidate, and never runs', async () => {
    const run: RunSuite = vi.fn();
    const { entries, ranSuite, warning } = await readCoverage(root, 'src', run);

    expect(ranSuite).toBe(false);
    expect(run).not.toHaveBeenCalled(); // report present → zero runs
    expect(warning).toBeUndefined();

    const { perFile, baseline } = computeCoverage(entries, candidates);
    expect([...perFile.keys()].sort()).toEqual([...candidates].sort());
    expect(perFile.get('src/covered.ts')).toBe(1);
    expect(perFile.get('src/partial.ts')).toBe(0.5);
    expect(perFile.get('src/orphan.ts')).toBe(0); // absent from report
    expect(baseline).toBe(0.75); // (2 + 1) covered / (2 + 2) measurable lines
  });
});

describe('readCoverage — the missing-report path runs exactly once', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'testsmith-cov-missing-'));
    // No coverage/ directory at all.
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('invokes runSuite once and parses the produced report', async () => {
    const { run } = await stubRun(root, { 'src/a.ts': [[1, 1], [2, 0]] });
    const { entries, ranSuite } = await readCoverage(root, 'src', run);

    expect(run).toHaveBeenCalledTimes(1); // single run (acceptance #3)
    expect(ranSuite).toBe(true);

    const { perFile } = computeCoverage(entries, ['src/a.ts']);
    expect(perFile.get('src/a.ts')).toBe(0.5);
  });
});

describe('readCoverage — a corrupt existing report falls through to a single run', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'testsmith-cov-corrupt-'));
    await mkdir(join(root, 'coverage'), { recursive: true });
    await writeFile(join(root, 'coverage', 'coverage-final.json'), '{ this is not json');
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('treats the unparseable report as missing and runs once', async () => {
    const { run } = await stubRun(root, { 'src/a.ts': [[1, 1]] });
    const { ranSuite } = await readCoverage(root, 'src', run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(ranSuite).toBe(true);
  });
});

describe('readCoverage — never fatal', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'testsmith-cov-degrade-'));
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('degrades to no entries + a warning when the run produces no report', async () => {
    const run: RunSuite = vi.fn(async () => ({ reportPath: null, failed: true }));
    const { entries, ranSuite, warning } = await readCoverage(root, 'src', run);

    expect(ranSuite).toBe(true);
    expect(entries).toEqual([]);
    expect(warning).toMatch(/coverage/i);

    // Coverage then seeds every candidate at 0 — never fatal.
    const { perFile, baseline } = computeCoverage(entries, ['src/a.ts']);
    expect(perFile.get('src/a.ts')).toBe(0);
    expect(baseline).toBe(0);
  });

  it('warns about a flaky baseline when the suite ran red but still emitted coverage', async () => {
    const { run } = await stubRun(root, { 'src/a.ts': [[1, 1]] }, /* failed */ true);
    const { entries, warning } = await readCoverage(root, 'src', run);

    expect(entries.length).toBeGreaterThan(0);
    expect(warning).toMatch(/failing tests/i);
  });
});
