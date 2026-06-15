# Testsmith

Testsmith is a CLI that ranks a TypeScript-React project's source files by
test-risk, generates Vitest + RTL tests for the riskiest, and reports the
coverage delta. This glossary fixes the language the pipeline is built on.

## Language

**Candidate source file**:
A source file that Testsmith is willing to generate a test for — the unit the
whole pipeline ranks and acts on. Produced by the _scan_ stage's enumeration
step as the project-root-relative, forward-slashed path to the file. Test
files, type declarations, config, and generated output are by definition NOT
candidates.
_Avoid_: source file (too broad — includes tests/config), target (reserve for a
candidate that has been scored)

**Scanned set**:
The complete set of candidate source files produced by one enumeration run. It
is the population over which every score is percentile-ranked, so it must be
explicit and owned by enumeration — never a byproduct of the import graph or
AST analysis.
_Avoid_: file list, all files

**Source root**:
The single directory enumeration walks, from config `sourceRoot` (default
`src`). Files outside it are never candidates.
_Avoid_: src dir, root

**Project root**:
The directory containing the target project's `package.json`; the anchor all
candidate paths are made relative to (matching how git churn and the import
graph report paths).
_Avoid_: cwd, repo root

**Test file**:
A file that already holds tests and is therefore excluded from the scanned set.
Precisely: its filename's penultimate dot-segment is exactly `test` or `spec`
(`Button.test.tsx`, `utils.spec.ts` — but not `latest.ts`), OR any segment of
its path is `__tests__`. Test-support files (setup/config) are not test files;
they are excluded under [[config-file]] instead.
_Avoid_: spec, test suite

**Config file**:
A non-product file that configures tooling, excluded from the scanned set.
Identified by the `.config.` or `.setup.` infix (`vite.config.ts`,
`vitest.setup.ts` — but NOT a bare `config.ts`/`setup.ts`, which are app source
and stay candidates), the RTL-default name `setupTests.{ts,js}`, or a filename
beginning with `.` (`.eslintrc.js`). Config outside the [[source-root]] is
excluded for free by never being walked.
_Avoid_: settings, rc file

**Generated output**:
Files produced by tooling rather than written by a human, excluded from the
scanned set. Identified structurally — never by reading `.gitignore` — via a
fixed list of directory segments matched anywhere in the path (`node_modules`,
`dist`, `build`, `coverage`, `out`, `__generated__`) plus any dot-directory
(`.next`, `.turbo`, `.cache`). Project-specific generated paths inside the
[[source-root]] (e.g. `src/generated/**`) are the user's `ignore`-glob
responsibility, not auto-detected.
_Avoid_: build artifacts, vendored code

**Candidate extension**:
The exactly four file extensions a [[candidate-source-file]] may have: `.ts`,
`.tsx`, `.js`, `.jsx`. `.mjs`/`.cjs` are excluded (almost always tooling, not
React code — scope discipline). A `.d.ts` declaration file is excluded despite
ending in `.ts`: it is pure types with no runtime to test.
_Avoid_: source extension

**Ignore glob**:
A user-supplied pattern (config `ignore`) that removes additional files from the
scanned set. Matched against the project-root-relative path (so it carries the
`src/` prefix, e.g. `src/generated/**`). Purely _additive_: it can drop a file
the built-in rules would have kept, but can never re-include one they exclude.
_Avoid_: exclude pattern, filter
