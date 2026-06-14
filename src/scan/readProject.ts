import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigSignals, PackageJson } from './types.js';

export type ProjectReadResult =
  | { ok: true; pkg: PackageJson; signals: ConfigSignals }
  | { ok: false; error: 'missing-package-json' | 'invalid-package-json'; path: string };

/** Rival runner config filenames we look for to enrich detection failures. */
const RIVAL_RUNNER_CONFIGS = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.json',
  '.mocharc.js',
  '.mocharc.cjs',
  '.mocharc.json',
  '.mocharc.yml',
  '.mocharc.yaml',
  'ava.config.js',
  'ava.config.cjs',
];

/**
 * Thin I/O layer in front of the pure {@link detectStack} analyzer: reads and
 * parses the project's package.json and gathers corroborating config signals.
 * Missing or malformed package.json are surfaced as friendly results, never
 * thrown — the CLI turns them into actionable messages.
 */
export function readProject(dir: string): ProjectReadResult {
  const pkgPath = join(dir, 'package.json');

  let raw: string;
  try {
    raw = readFileSync(pkgPath, 'utf8');
  } catch {
    return { ok: false, error: 'missing-package-json', path: pkgPath };
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-package-json', path: pkgPath };
  }

  const rivalRunnerConfigs = RIVAL_RUNNER_CONFIGS.filter((f) => existsSync(join(dir, f)));
  const signals: ConfigSignals = rivalRunnerConfigs.length > 0 ? { rivalRunnerConfigs } : {};

  return { ok: true, pkg, signals };
}
