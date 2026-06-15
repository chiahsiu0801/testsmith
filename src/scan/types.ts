/**
 * Stage 1 (scan) — framework & runner detection types.
 *
 * v1 supports React + Vitest ONLY. Detection gates on the presence of `react`
 * and `vitest` in package.json dependencies/devDependencies (see SPEC §4.1).
 * Config files and rival tooling are inspected only to enrich error messages,
 * never to gate.
 */

/** The slice of package.json the analyzer cares about. */
export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/**
 * Corroborating signals gathered from disk by the I/O layer. Used purely to
 * make failure messages more actionable — they do not affect the pass/fail gate.
 */
export interface ConfigSignals {
  /** Rival runner config files found on disk, e.g. 'jest.config.js'. */
  rivalRunnerConfigs?: string[];
}

export type RivalRunner = 'jest' | 'mocha' | 'jasmine' | 'ava';
export type RivalFramework = 'vue' | 'svelte' | 'angular' | 'preact';

export type DetectionFailure =
  | { kind: 'missing-react' }
  | { kind: 'missing-vitest' }
  | { kind: 'rival-runner'; found: RivalRunner }
  | { kind: 'rival-framework'; found: RivalFramework };

export type DetectionResult =
  | {
      ok: true;
      framework: 'react';
      runner: 'vitest';
      reactVersion: string;
      vitestVersion: string;
      warnings: string[];
    }
  | { ok: false; reasons: DetectionFailure[] };

/**
 * The config slice the enumeration step consumes (see SPEC §4.1.2, §8). Defaults
 * (e.g. `sourceRoot: 'src'`) are resolved by the config layer — enumeration is
 * handed an already-resolved slice and never reads `.testsmith.json` itself.
 */
export interface CandidateConfig {
  /** Single directory enumeration walks, project-root-relative (e.g. 'src'). */
  sourceRoot: string;
  /**
   * User ignore globs, matched against the project-root-relative path (so they
   * carry the `src/` prefix, e.g. `src/generated/**`). Purely additive: they can
   * drop a file the built-in rules keep, never re-include one they exclude.
   */
  ignore: string[];
}

/**
 * Output of the enumeration step: the scanned set of candidate source files,
 * or a friendly failure when the source root is absent. Mirrors the
 * discriminated-union style of {@link DetectionResult} / ProjectReadResult so
 * the CLI can render an actionable message rather than catch a throw.
 */
export type EnumerationResult =
  | { ok: true; files: string[] }
  | { ok: false; error: 'missing-source-root'; path: string };
