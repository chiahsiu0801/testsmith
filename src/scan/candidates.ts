import picomatch from 'picomatch';
import type { CandidateConfig } from './types.js';

/**
 * PURE candidate-file rules for the scan stage (SPEC §4.1.2). No fs, git, or
 * network: the input is a project-root-relative POSIX path string, the output
 * is a keep/drop decision. This is the single authority on what belongs in the
 * scanned set — the I/O walker in {@link ./enumerateSources} defers every
 * decision here, so every exclusion rule is unit-testable with plain strings.
 *
 * Why structural rules (not `.gitignore`): the scanned set is the population
 * every score is percentile-ranked against, so it must be reproducible from a
 * path alone. See docs/adr/0001-enumeration-ignores-gitignore.md.
 */

/** The only four extensions a candidate may have (SPEC §4.1.2). `.mjs`/`.cjs`
 *  are almost always tooling, not React code, so they are excluded. */
const CANDIDATE_EXT = /\.(ts|tsx|js|jsx)$/;

/** Directory-name segments that mark vendored or generated output. Matched as a
 *  whole path segment anywhere, so they hold even when `sourceRoot` is `.`. Any
 *  dot-directory (`.next`, `.cache`) is excluded separately by the leading-dot
 *  check, which also covers leading-dot config files like `.eslintrc.js`. */
const EXCLUDED_DIR_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  '__generated__',
]);

/** Filename infixes that mark tooling config/setup. A prefix segment is
 *  required (the leading `*.`), so a bare `config.ts`/`setup.ts` — which is app
 *  source worth testing — is NOT matched. */
const CONFIG_INFIX = /\.(config|setup)\.[^.]+$/;

/** The CRA/RTL default setup filename, which has no `.setup.` infix to catch. */
const SETUP_TESTS = /^setupTests\.(ts|js)$/;

const basename = (relPath: string): string => relPath.slice(relPath.lastIndexOf('/') + 1);

/** A test file: penultimate dot-segment is exactly `test`/`spec` (so `latest.ts`
 *  is safe), or any path segment is `__tests__`. */
const isTestFile = (relPath: string): boolean => {
  if (relPath.split('/').includes('__tests__')) return true;
  const parts = basename(relPath).split('.');
  if (parts.length < 3) return false; // needs name.test.ext
  const penultimate = parts[parts.length - 2];
  return penultimate === 'test' || penultimate === 'spec';
};

/** A tooling config/setup file (SPEC §4.1.2). Config living outside the source
 *  root is excluded for free by never being walked; this catches config inside. */
const isConfigFile = (name: string): boolean => CONFIG_INFIX.test(name) || SETUP_TESTS.test(name);

/**
 * True when `relPath` (project-root-relative, POSIX) should be in the scanned
 * set. Every gate is a structural string check; ignore globs are matched with
 * picomatch, project-root-anchored.
 */
export function isCandidate(relPath: string, config: CandidateConfig): boolean {
  // Must live under the source root (the walker guarantees this; re-asserting
  // keeps the predicate self-contained and testable in isolation). A `.`/empty
  // root means "the whole project", so it imposes no prefix.
  const root = config.sourceRoot;
  const underRoot =
    root === '.' || root === '' || relPath === root || relPath.startsWith(`${root}/`);
  if (!underRoot) return false;

  // Right extension, and not a `.d.ts` type declaration (no runtime to test).
  if (!CANDIDATE_EXT.test(relPath)) return false;
  if (relPath.endsWith('.d.ts')) return false;

  // No vendored/generated/dot directory anywhere in the path. The leading-dot
  // check covers both dot-directories and leading-dot config files.
  const segments = relPath.split('/');
  for (const seg of segments) {
    if (EXCLUDED_DIR_SEGMENTS.has(seg)) return false;
    if (seg.startsWith('.')) return false;
  }

  const name = segments[segments.length - 1];
  if (isTestFile(relPath)) return false;
  if (isConfigFile(name)) return false;

  // User ignore globs are the last gate — additive only.
  if (config.ignore.length > 0 && picomatch(config.ignore)(relPath)) return false;

  return true;
}

/** Filter a list of project-root-relative paths down to the scanned set. */
export function filterCandidates(relPaths: string[], config: CandidateConfig): string[] {
  return relPaths.filter((p) => isCandidate(p, config));
}
