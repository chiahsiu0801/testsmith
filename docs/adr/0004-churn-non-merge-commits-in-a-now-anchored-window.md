# Churn counts non-merge commits in a now-anchored window, path-scoped, filtered in the pure core

The scan stage computes a per-file `churn` signal (SPEC §6/§8) — "# commits
touching the file in the last _D_ days (default 180)" — with simple-git. The SPEC
fixes the intent (a recency/hotspot proxy) but leaves the definitional edges open.
We define churn as:

- **Window anchored to wall-clock now, not HEAD.** A commit counts iff its date is
  within `[referenceDate − churnWindowDays, referenceDate]`, where `referenceDate`
  is wall-clock now at scan time (injected, default `new Date()`). A file dormant
  for a year scores 0.
- **Committer date, not author date.** The window is tested against `%cI`
  (committer date), which reflects when the change landed on this history;
  rebase/cherry-pick reset it to the landing time, author date can be arbitrarily
  old.
- **Non-merge commits only (`--no-merges`).** A merge commit touching a file is an
  integration artifact, not an edit. One non-merge commit = one unit of churn.
- **Path-scoped; renames NOT followed.** Commits count only under the file's
  current path. A rename inside the window undercounts (a documented v1 limit).
- **Distinct commits, deduped within a commit.** A file touched twice in one
  commit adds 1, mirroring fan-in's distinct-importer rule.
- A file with no in-window commits scores **0**, and every candidate is seeded at
  0 so it always carries a number.

## Why

- **Now-anchored measures *current* risk.** Churn feeds a "what should I test
  *next*" ranking. Recent change is the signal; letting a dormant file decay to 0
  is correct. HEAD-anchoring would keep a repo's year-old hotspots hot forever.
  The cost — churn is not reproducible day-to-day for the same repo — is accepted
  and recorded in CONTEXT.md.
- **Excluding merges makes churn workflow-independent.** Counting merge commits
  would score identical work differently under a merge-commit vs squash-merge
  workflow (this repo uses PR merges). `--no-merges` makes churn mean "how many
  real changes landed on this file," independent of branching style.
- **Not following renames keeps the single-pass log.** `--follow` works one file
  at a time and forbids a whole-repo log, forcing N git invocations or a
  hand-rolled rename-chain reconstruction. Path-scoping lets one
  `git log --no-merges --name-only --format=%cI` over `sourceRoot` be parsed once
  and tallied — fast, and simple to make the acceptance oracle. Follow-renames is
  deferred.
- **The window filter lives in the pure core, not `git --since`.** `--since` uses
  git's own wall clock at invocation and is approximate, which would ignore the
  injected `referenceDate` and make the metric non-deterministic. So git
  over-fetches (emits every non-merge commit with its `%cI`) and the pure core
  (`computeChurn`) applies the `referenceDate − windowDays` cutoff. The one
  genuinely debatable boundary rule is thus unit-testable with plain data — the
  same pure-core / thin-walker split as fan-in (ADR 0003) and complexity (ADR
  0002), where the debatable rule (`type-only`, `?.`) also lives in the pure core.

## Consequences

- **Two modules, mirroring fan-in.** Pure `src/scan/churn.ts`
  (`computeChurn(commits, candidates, windowDays, referenceDate) → Map`) owns all
  policy; I/O `src/scan/gitLog.ts` runs simple-git, resolves the git root via
  `rev-parse --show-toplevel`, and rebases every logged path from git-root-relative
  to **project-root-relative POSIX** before handing it over. Without that rebase a
  monorepo (package.json below the git root) would silently zero every count — the
  same keying hazard ADR 0003 flagged for fan-in — so the integration test asserts
  keys against `enumerateSources`.
- **Churn is never fatal.** `gitLog.ts` returns `{ commits, warning? }` and always
  yields a usable all-zeros map. `warning` is set only for *not a git repo* and
  *git binary not found*; an empty-history repo and a file with no history are
  legitimate silent zeros. The caller prints `warning` to stderr as `⚠ …`, like
  detect's warnings — churn degrades, it does not crash (acceptance criterion #2).
- **Sets the scale for percentile rank (SPEC §6).** Like complexity and fan-in,
  changing this definition later — HEAD-anchoring, counting merges, following
  renames — shifts every file's churn and therefore every downstream rank. That
  hard-to-reverse property is why it is recorded here.
- **Acceptance oracle.** "Counts match git log" is pinned to: non-merge commits
  whose committer date is within the window, under the current path. The
  integration test builds a temp git repo in `beforeAll` with dates pinned via
  `GIT_COMMITTER_DATE`, exercising in-window vs aged-out, a 3-commit file, a merge
  (excluded), and a never-committed file (0). Pure tallying is unit-tested
  separately with plain `CommitTouch` objects.
