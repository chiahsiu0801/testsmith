import type {
  ConfigSignals,
  DetectionFailure,
  DetectionResult,
  PackageJson,
  RivalFramework,
  RivalRunner,
} from './types.js';

/** Rival frameworks we recognize purely to produce a better error message. */
const RIVAL_FRAMEWORKS: RivalFramework[] = ['vue', 'svelte', 'angular', 'preact'];
/** Rival runners, recognized from deps and from config filenames. */
const RIVAL_RUNNERS: RivalRunner[] = ['jest', 'mocha', 'jasmine', 'ava'];

const allDeps = (pkg: PackageJson): Record<string, string> => ({
  ...pkg.dependencies,
  ...pkg.devDependencies,
});

/**
 * Extract the cheaply-parseable major version from a dependency range.
 * Returns null for ranges we can't read confidently (e.g. `workspace:*`, `*`),
 * so callers can stay silent rather than warn on a guess.
 */
const parseMajor = (range: string): number | null => {
  const m = /^[\^~>=<v\s]*(\d+)/.exec(range);
  return m ? Number(m[1]) : null;
};

/** Map a rival runner config filename back to its runner. */
const runnerFromConfig = (filename: string): RivalRunner | null => {
  const lower = filename.toLowerCase();
  return RIVAL_RUNNERS.find((r) => lower.includes(`${r}.config`)) ?? null;
};

/**
 * Pure framework/runner gate for Testsmith v1.
 *
 * Gate: `react` AND `vitest` must be present in dependencies/devDependencies.
 * Rival frameworks/runners and config-file signals are inspected only to make
 * a failure message actionable — they never cause or prevent a pass.
 */
export function detectStack(pkg: PackageJson, signals: ConfigSignals = {}): DetectionResult {
  const deps = allDeps(pkg);
  const reactVersion = deps['react'];
  const vitestVersion = deps['vitest'];

  if (reactVersion && vitestVersion) {
    const warnings: string[] = [];
    const major = parseMajor(reactVersion);
    if (major !== null && major < 18) {
      warnings.push(
        `React ${reactVersion} detected; React Testing Library 16 (used by generated tests) requires React 18+.`,
      );
    }
    return {
      ok: true,
      framework: 'react',
      runner: 'vitest',
      reactVersion,
      vitestVersion,
      warnings,
    };
  }

  const reasons: DetectionFailure[] = [];
  if (!reactVersion) reasons.push({ kind: 'missing-react' });
  if (!vitestVersion) reasons.push({ kind: 'missing-vitest' });

  for (const fw of RIVAL_FRAMEWORKS) {
    if (deps[fw]) reasons.push({ kind: 'rival-framework', found: fw });
  }

  const rivalRunners = new Set<RivalRunner>();
  for (const r of RIVAL_RUNNERS) {
    if (deps[r]) rivalRunners.add(r);
  }
  for (const file of signals.rivalRunnerConfigs ?? []) {
    const r = runnerFromConfig(file);
    if (r) rivalRunners.add(r);
  }
  for (const r of rivalRunners) {
    reasons.push({ kind: 'rival-runner', found: r });
  }

  return { ok: false, reasons };
}
