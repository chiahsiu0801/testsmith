/**
 * PURE churn core for the scan stage (SPEC §6/§8). No fs, git, or network: the
 * input is an already-parsed, path-normalized commit list (the I/O layer in
 * {@link ./gitLog} runs simple-git and rebases paths here), so every window and
 * tallying rule is unit-testable with plain objects — the same pure-core / thin-
 * walker split as {@link ./fanIn} ↔ {@link ./importGraph}.
 *
 * Churn = the number of DISTINCT non-merge commits whose committer date falls in
 * the window and that touch a [[candidate-source-file]] under its current path
 * (see docs/adr/0004). The window and dedupe rules — the only debatable policy —
 * live here; merge exclusion and path rebasing live in the I/O layer.
 */

/**
 * A non-merge commit and the candidate-space paths it touched. `committedAt` is
 * the committer date (`%cI`); `files` are project-root-relative POSIX paths the
 * I/O layer already rebased from git-root-relative. A commit that deletes a file
 * still lists it — that path simply won't be a candidate, so it drops out below.
 */
export interface CommitTouch {
  committedAt: Date;
  files: string[];
}

export function computeChurn(
  commits: CommitTouch[],
  candidates: string[],
  windowDays: number,
  referenceDate: Date,
): Map<string, number> {
  const churn = new Map<string, number>();
  for (const file of candidates) churn.set(file, 0);

  const cutoff = referenceDate.getTime() - windowDays * 24 * 60 * 60 * 1000;

  for (const commit of commits) {
    const at = commit.committedAt.getTime();
    if (at < cutoff || at > referenceDate.getTime()) continue;
    // Distinct files per commit: a file touched twice in one commit is one unit.
    for (const file of new Set(commit.files)) {
      if (churn.has(file)) churn.set(file, churn.get(file)! + 1);
    }
  }
  return churn;
}
