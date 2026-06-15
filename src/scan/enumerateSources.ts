import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fastGlob from 'fast-glob';
import { filterCandidates } from './candidates.js';
import type { CandidateConfig, EnumerationResult } from './types.js';

/**
 * Thin I/O walker for the scan stage's enumeration step (SPEC §4.1.2): globs the
 * source root and defers every keep/drop decision to the pure
 * {@link filterCandidates} predicate. Returns project-root-relative, POSIX,
 * lexicographically-sorted paths so output is stable across platforms and the
 * scanned set is reproducible from a fixture tree.
 */
export function enumerateSources(projectRoot: string, config: CandidateConfig): EnumerationResult {
  const root = config.sourceRoot === '.' || config.sourceRoot === '' ? '' : config.sourceRoot;
  const absRoot = join(projectRoot, root);

  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    return { ok: false, error: 'missing-source-root', path: absRoot };
  }

  const pattern = root === '' ? '**/*.{ts,tsx,js,jsx}' : `${root}/**/*.{ts,tsx,js,jsx}`;

  // `ignore` and `dot: false` are walk-performance prunes only (don't descend
  // into huge vendored/dot trees); they are redundant with the predicate, which
  // remains the sole authority on the scanned set.
  const matches = fastGlob.sync(pattern, {
    cwd: projectRoot,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**'],
  });

  return { ok: true, files: filterCandidates(matches, config).sort() };
}
