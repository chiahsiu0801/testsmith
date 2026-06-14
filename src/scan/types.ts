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
