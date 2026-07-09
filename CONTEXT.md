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

**Decision point**:
A syntactic construct that introduces a branch in control flow and so adds 1 to
[[cyclomatic-complexity]]. The fixed set (the ESLint `complexity` rule's set):
`if`/`else if`, `for`/`for-in`/`for-of`, `while`, `do-while`, each `case` label
(not `default`), `catch`, the ternary `?:`, and each logical `&&`, `||`, `??`.
Optional chaining (`?.`) is deliberately NOT a decision point — it is a
null-safety idiom, not branching logic, and counting it would inflate the score
in idiomatic React. JSX conditional rendering needs no special rule: `{c && …}`
and `{c ? … : …}` are already a logical operator and a ternary.
_Avoid_: branch, conditional (too broad)

**Cyclomatic complexity**:
The raw per-file complexity signal (feeds `TargetFile.complexity`, SPEC §6/§8),
computed by the scan stage with ts-morph. Defined as: a file baseline of 1, plus
one for every [[decision-point]] anywhere in the file (including module scope),
plus one for every nested function unit (its baseline). Equivalently: each
function unit is scored in isolation starting at 1 and the file total is their
sum, with module-scope decision points folded into the file baseline. A "function
unit" is a function declaration, function expression, arrow function, class
method, accessor (get/set), or constructor; a React component is just a function
and gets no special case. Consequence: every non-empty candidate scores ≥ 1, and
function count contributes to the score (a many-function file is more to test).
_Avoid_: complexity (bare — ambiguous with score), CC for JSX

**Import edge**:
A directed runtime dependency from one [[candidate-source-file]] to another,
extracted by the scan stage with dependency-cruiser. "Runtime" excludes
type-only imports (`import type`); plain imports, dynamic `import()`, and
re-exports (`export … from`) all qualify. Both endpoints must be candidates, so
edges into `node_modules` (and any non-candidate test/config/story file) are not
import edges at all. Edges are de-duplicated by (from, to): two imports of the
same module from one file are a single edge.
_Avoid_: dependency, import (bare — includes type-only and external), reference

**Fan-in**:
The raw per-file fan-in signal (feeds `TargetFile.fanIn`, SPEC §6/§8): the number
of distinct [[candidate-source-file]]s that reach the file by an [[import-edge]].
A leaf imported by nobody scores 0; a file imported only via type-only edges, only
by test files, or only from `node_modules` also scores 0, because none of those
are import edges. It is a proxy for blast radius — how much breaks if this file
breaks — deliberately kept orthogonal to test coverage (test-file importers never
count, so adding a test never raises a file's fan-in).
_Avoid_: dependents, usages, references, importers (bare)

**Churn**:
The raw per-file churn signal (feeds `TargetFile.churn`, SPEC §6/§8): the number
of distinct non-merge commits whose committer date falls inside the
[[churn-window]] and that touch the [[candidate-source-file]] under its current
path. A recency proxy for "how often this code changes" (hotspot signal). A file
touched twice in one commit counts that commit once; merge commits never count;
history is NOT followed across renames, so a file renamed inside the window is
scored only from commits under its new path (a documented v1 undercount). A file
with no commits in the window — new, never committed, or dormant — scores 0, and
every candidate is seeded at 0 so it always carries a number.
_Avoid_: commits (bare), edits, changes, git activity, hotspot (reserve for the
churn×complexity interaction term, SPEC §6)

**Churn window**:
The recency horizon churn is measured over: commits from `referenceDate −
churnWindowDays` up to `referenceDate`, where `churnWindowDays` is config (default
180) and `referenceDate` is wall-clock now at scan time. Anchoring to now (not the
newest commit) is deliberate — a dormant file decays toward 0 churn, which is the
correct current-risk reading. Because the anchor moves, [[churn]] is not
reproducible across days for the same repo; that is accepted.
_Avoid_: since date, lookback, history depth

**Line coverage**:
The raw per-file coverage signal (feeds `TargetFile.lineCoverage`, a `0..1` ratio,
SPEC §6/§8): the fraction of a [[candidate-source-file]]'s executable lines that the
project's existing test suite runs, drawn from the [[coverage-report]]. A line is
covered iff at least one statement on it executed — istanbul's rule: a line's hit
count is the *max* hit-count among the statements starting on that line, and
`lineCoverage = (lines with hits) / (distinct start-lines)`. A candidate absent from
the report — no test exercises it — scores 0, and every candidate is seeded at 0 so
it always carries a number. A candidate with no executable lines scores 1 (nothing
left to cover), so it sinks in the ranking instead of masquerading as maximally
risky. Kept as the raw ratio here; the `1 − lineCoverage` gap and its weighting are
a score-stage concern.
_Avoid_: coverage (bare), test coverage, coverage %, covered (as a bare adjective)

**Coverage report**:
The istanbul-shape JSON coverage artifact that is [[line-coverage]]'s source: read
from the project's existing coverage output if present, otherwise produced by running
the suite once with coverage. Its per-file entries carry the statement map and hit
counts the pure core turns into [[line-coverage]]. Keyed by absolute path, rebased to
project-root-relative POSIX so it joins onto the [[scanned-set]] — the same keying
discipline as [[churn]] and [[fan-in]]. Only [[candidate-source-file]]s draw a number
from it; entries for tests, config, and other non-candidates are ignored. A usable
existing report is trusted as-is and NOT checked for staleness against later source
edits (a documented v1 limitation, akin to [[churn]]'s day-to-day drift); the escape
hatch is to delete it and let Testsmith regenerate one.
_Avoid_: coverage data, lcov, coverage file (bare)

**Baseline coverage**:
The single overall coverage number captured at scan time (feeds
`ScanResult.baselineCoverage`, SPEC §8): the lines-weighted aggregate of
[[line-coverage]] across the [[scanned-set]] — `Σ covered lines / Σ total lines` over
[[candidate-source-file]]s only, NOT a mean of per-file percentages and NOT the
[[coverage-report]]'s own grand total (which spans non-candidates). It is the
"before" figure the report stage measures its coverage delta against, so it is scoped
to exactly the files Testsmith ranks and acts on.
_Avoid_: overall coverage (bare — implies project-wide), total coverage, coverage
score
