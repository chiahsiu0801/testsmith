import { realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { CommitTouch } from './churn.js';

/**
 * I/O layer for the churn signal (SPEC §4.1, §6): runs one whole-history
 * `git log` over the source root via simple-git and hands a normalized
 * {@link CommitTouch} list to the pure {@link ./churn} core — the same pure-core
 * / thin-walker split as {@link ./fanIn} ↔ {@link ./importGraph}. All git
 * invocation and path rebasing live here; all window/tallying policy lives in the
 * pure core (docs/adr/0004).
 *
 * Design choices pinned in docs/adr/0004:
 *  - `--no-merges`: merge commits are integration artifacts, not edits. (git also
 *    omits a file list for merges by default, so this is belt-and-suspenders.)
 *  - NO `--since`: git's `--since` uses git's own wall clock and is approximate,
 *    which would ignore the injected `referenceDate`. We over-fetch every commit
 *    with its committer date (`%cI`) and let the pure core own the window cutoff.
 *  - Rename following is deliberately OFF (`--follow` forbids a whole-repo log).
 *
 * Never fatal: a non-git directory or a missing git binary yields
 * `{ commits: [], warning }`, so churn degrades to all-zeros rather than crashing
 * (acceptance #2). An empty-history repo and a file with no history are
 * legitimate silent zeros — no warning.
 */

/** Marks the start of each commit record in the log stream: the ASCII Record
 *  Separator (0x1e), emitted by git's `--format=%x1e`. It cannot appear in a
 *  path or an ISO date, so splitting on it is unambiguous. */
const RECORD = '\x1e';

/** Defensive separator normalization: git emits POSIX separators, but rebasing
 *  through node:path on Windows yields `\`. Match the scanned set's POSIX keys. */
const toPosix = (p: string): string => p.split('\\').join('/');

/**
 * Parse the `git log --name-only` stream into commits. Each record is
 * `<RECORD><committer-ISO>\n\n<file>\n<file>…`; the leading RECORD marker
 * (injected via `--format=%x1e%cI`) delimits records.
 */
function parseLog(raw: string, rebase: (gitRootRelPath: string) => string): CommitTouch[] {
  const commits: CommitTouch[] = [];
  for (const record of raw.split(RECORD)) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [dateLine, ...rest] = trimmed.split('\n');
    const committedAt = new Date(dateLine.trim());
    const files = rest
      .map((l) => l.trim())
      .filter(Boolean)
      .map(rebase);
    commits.push({ committedAt, files });
  }
  return commits;
}

export interface GitLogResult {
  commits: CommitTouch[];
  /** Present only when churn could not be computed for the whole tree
   *  (not a git repo, or git binary unavailable). */
  warning?: string;
}

export async function readGitLog(projectRoot: string, sourceRoot: string): Promise<GitLogResult> {
  const git: SimpleGit = simpleGit(projectRoot);

  try {
    if (!(await git.version()).installed) {
      return { commits: [], warning: 'git is not installed or not on PATH — churn scored as 0.' };
    }
    if (!(await git.checkIsRepo())) {
      return {
        commits: [],
        warning: `${projectRoot} is not a git repository — churn scored as 0.`,
      };
    }

    // git reports paths relative to the repo root; candidates are project-root-
    // relative. Rebase through absolute paths so a monorepo (package.json below
    // the git root) still joins onto the scanned set instead of silently zeroing.
    // Canonicalize BOTH roots with realpath first: git resolves long/real paths,
    // but a caller (or os.tmpdir on Windows) may hand us an 8.3 short name or a
    // differently-cased drive, and path.relative compares strings — a mismatch
    // would rebase every file to `../../…` and silently zero all churn.
    const canonicalRoot = await realpath(projectRoot);
    const gitRoot = await realpath((await git.revparse(['--show-toplevel'])).trim());
    const rebase = (gitRootRelPath: string): string =>
      toPosix(relative(canonicalRoot, resolve(gitRoot, gitRootRelPath)));

    const raw = await git.raw([
      'log',
      '--no-merges',
      '--name-only',
      '--format=%x1e%cI',
      '--',
      sourceRoot,
    ]);

    return { commits: parseLog(raw, rebase) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { commits: [], warning: `could not read git history — churn scored as 0 (${detail}).` };
  }
}
