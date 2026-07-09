# Coverage baseline reads istanbul JSON, derives line coverage in the pure core, and forces coverage.all for a candidate-scoped denominator

The scan stage computes the per-file `lineCoverage` signal and the overall
`baselineCoverage` (SPEC §4.1.4, §6/§8) — "read an existing coverage report if
present, otherwise run the existing suite once with `--coverage`; files with no test
get 0." The SPEC fixes the intent but leaves the report format, the definition of
"line coverage," and the overall aggregate open. We decide:

- **Read istanbul-shape `coverage-final.json`.** This is what Vitest's *default*
  `json` reporter emits, so a project that already runs coverage most likely has it —
  the "read if present" path actually fires. `json-summary` (`coverage-summary.json`,
  with a ready-made `lines.pct`) is opt-in and usually absent, so we do NOT depend on
  it. When no report is present we run the suite once with
  `--coverage.reporter=json`, producing exactly that same artifact — one format for
  both the read and the run path.
- **Line coverage is derived in the pure core**, using istanbul's own rule: a line's
  hit count is the *max* hit-count among the statements *starting* on that line, and
  `lineCoverage = (lines with hits) / (distinct start-lines)`. The I/O layer hands the
  pure core each file's `{ statementMap, s }`; the one debatable definition (what
  counts as a covered line) is unit-testable with plain fixtures — the same pure-core
  / thin-walker split as churn (ADR 0004), fan-in (ADR 0003), and complexity (ADR
  0002).
- **Absent → 0, zero-executable-lines → 1.** A candidate with no entry in the report
  (no test exercises it) scores 0, and every candidate is seeded at 0 so it always
  carries a number — mirroring churn/fan-in. A candidate that *is* in the report but
  has no statements (a re-export barrel, an effectively empty module) scores 1
  (nothing left to cover) so it sinks in the ranking instead of masquerading as
  maximally risky, matching istanbul's empty-file = 100% convention and avoiding a
  divide-by-zero.
- **`baselineCoverage` is a lines-weighted aggregate over the scanned set** —
  `Σ covered lines / Σ total lines` across candidates only — NOT the report's own
  grand total (which spans non-candidate tests/config) and NOT a mean of per-file
  percentages.
- **Force `--coverage.all=true`, include-scoped to the source root.** Vitest then
  statically instruments every source file, so untested candidates appear in the
  report with their *real* total lines at 0% covered instead of being absent.

## Why

- **The default `json` reporter is the one artifact a coverage-running project
  reliably has.** Reading `coverage-final.json` makes Task 1 ("read an existing report
  if present") meaningful in practice; keying the design on `json-summary` would make
  the read path dead code on most repos. Emitting the same format on the run path
  keeps a single parser and a single acceptance oracle.
- **The debatable rule belongs in the pure core.** "What is a covered line" is the
  only genuinely arguable choice here (max-per-line vs. any-statement, how empty files
  count). Putting it in `computeCoverage(entries, candidates)` keeps it a pure
  function of plain data — the same reason the churn window, the fan-in runtime-edge
  filter, and the complexity decision-point set all live in pure cores.
- **`coverage.all` is what makes the baseline honest, and the honest baseline is the
  product's headline claim.** Without `all`, an untested candidate is absent from the
  report, contributes `0 covered / 0 total`, and drops out of the denominator — so
  `baselineCoverage` collapses to "average coverage among files that already have a
  test." A 50%-untested codebase could then report an 80% baseline, directly
  undermining a tool whose pitch is "your coverage is low, let's fix the riskiest
  gaps," and making the report stage's before/after delta incoherent (the denominator
  would grow as untested files gain tests). Forcing `all` fixes the denominator to
  *all* candidate lines, so both the baseline and the delta are truthful and stable.
- **Candidate-scoped, not report-scoped.** The scanned set is the population every
  other signal is percentile-ranked over; an "overall" number computed over a
  different population (the report's grand total, which includes files we never rank)
  would be incoherent with the per-file numbers beside it. Lines-weighting — rather
  than averaging percentages — keeps a 3-line fully-covered file from offsetting a
  300-line untested one.

## Consequences

- **Two modules, mirroring the other signals.** A pure `src/scan/coverage.ts`
  (`computeCoverage(entries, candidates) → { perFile: Map<string, number>, baseline:
  number }`) owns the line rule, the absent→0 / empty→1 seeding, and the lines-weighted
  aggregate; an I/O `src/scan/coverageReport.ts` locates or produces
  `coverage-final.json`, parses it, and hands over `{ path, statementMap, s }[]`.
  (Names to be confirmed when the module is built.)
- **Path rebasing is a keying hazard, as with churn and fan-in.** `coverage-final.json`
  is keyed by *absolute* path; the I/O layer must rebase to project-root-relative
  POSIX before the pure core joins onto the scanned set, or every candidate silently
  zeroes — the same failure ADR 0004 and 0003 guard against.
- **Never fatal (acceptance #2).** A missing/unreadable report, no coverage provider
  installed, or a failed run degrades to an all-zeros coverage map plus a `warning`
  the CLI prints as `⚠ …`, exactly like `gitLog`'s churn degradation — coverage
  disappears from the ranking, the tool does not crash.
- **Exactly one run on the missing-report path (acceptance #3).** The I/O layer reads
  the existing report if present and otherwise invokes the suite once; the read-vs-run
  decision is made in one place so a run can never be triggered twice.
- **Couples the baseline to Vitest's `coverage` include/exclude.** A candidate the
  project's coverage config deliberately excludes won't appear even under `all`; it
  then falls back to the absent→0 seeding and contributes no total lines, so it is
  weightless in the baseline. This is an accepted v1 limitation.
- **Hard to reverse.** Changing any of these — the format, the line rule, the empty-file
  convention, `all` on/off, or the candidate-scoped aggregate — shifts every file's
  `coverageGap` and therefore every downstream rank, plus the headline baseline. That
  is why the cluster is recorded here rather than left implicit in the code.
