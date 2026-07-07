import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { simpleGit, type SimpleGit } from 'simple-git';
import { readGitLog } from '../src/scan/gitLog.js';
import { computeChurn } from '../src/scan/churn.js';

/**
 * End-to-end acceptance for churn (docs/adr/0004, acceptance #1/#2): a temp git
 * repo with a KNOWN, date-pinned history yields churn counts that match git log,
 * and a non-git directory degrades to all-zeros + a warning rather than crashing.
 * The pure window/tallying rules are covered exhaustively in churn.test.ts; this
 * proves the simple-git wiring, the git-root→project-root path rebase, and the
 * join onto the candidate set — the parts the pure test can't reach.
 */

const REF = new Date('2026-07-01T00:00:00Z');
const WINDOW = 180;
const iso = (daysAgo: number) =>
  new Date(REF.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

/**
 * A HERMETIC child environment for git. `.env()` replaces the child's env
 * wholesale, so we hand git only what it needs to run (PATH etc.) plus a pinned
 * identity and date — deliberately omitting the ambient EDITOR / SSH_ASKPASS /
 * PAGER vars that simple-git's safety plugin would otherwise refuse to forward.
 * Determinism (fixed dates) and hygiene (no interactive escape hatches) in one.
 */
const gitEnv = (when: string): Record<string, string> => {
  const keep = [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'ComSpec',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'ProgramData',
  ];
  const env: Record<string, string> = {
    GIT_AUTHOR_NAME: 'Testsmith',
    GIT_AUTHOR_EMAIL: 'test@testsmith.dev',
    GIT_COMMITTER_NAME: 'Testsmith',
    GIT_COMMITTER_EMAIL: 'test@testsmith.dev',
    GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_DATE: when,
  };
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k]!;
  return env;
};

/** Commit `relPath` (project-root-relative) with a pinned committer+author date. */
async function commitFile(git: SimpleGit, root: string, relPath: string, when: string) {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, `// ${relPath} @ ${when}\n`);
  await git.add(relPath);
  await git.env(gitEnv(when)).commit(`touch ${relPath}`);
}

describe('readGitLog + computeChurn over a real temp repo', () => {
  let repo: string;
  const candidates = ['src/hot.ts', 'src/warm.ts', 'src/stale.ts', 'src/untouched.ts'];

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'testsmith-churn-'));
    const git = simpleGit(repo);
    await git.init();
    await git.addConfig('commit.gpgsign', 'false');

    // hot.ts: 3 commits in-window.
    await commitFile(git, repo, 'src/hot.ts', iso(5));
    await commitFile(git, repo, 'src/hot.ts', iso(20));
    await commitFile(git, repo, 'src/hot.ts', iso(60));
    // warm.ts: 1 commit in-window.
    await commitFile(git, repo, 'src/warm.ts', iso(30));
    // stale.ts: 1 commit OUTSIDE the window.
    await commitFile(git, repo, 'src/stale.ts', iso(300));

    // A merge commit that carries a change — must not inflate churn.
    const main = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    await git.checkoutLocalBranch('feature');
    await commitFile(git, repo, 'src/warm.ts', iso(10));
    await git.checkout(main);
    await git.env(gitEnv(iso(9))).merge(['--no-ff', '--no-edit', 'feature']);
    // untouched.ts is a candidate but never committed → churn 0.
  }, 30_000);

  afterAll(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it('returns churn counts matching git log, excluding out-of-window and merges', async () => {
    const { commits, warning } = await readGitLog(repo, 'src');

    expect(warning).toBeUndefined();

    const churn = computeChurn(commits, candidates, WINDOW, REF);

    expect(Object.fromEntries(churn)).toEqual({
      'src/hot.ts': 3, // three in-window commits
      'src/warm.ts': 2, // one on master + one on the merged branch (merge commit itself excluded)
      'src/stale.ts': 0, // only commit is outside the window
      'src/untouched.ts': 0, // never committed
    });
  });

  it('reports only candidate keys (git-root→project-root paths join onto the scanned set)', async () => {
    const { commits } = await readGitLog(repo, 'src');
    const churn = computeChurn(commits, candidates, WINDOW, REF);
    expect([...churn.keys()].sort()).toEqual([...candidates].sort());
  });
});

describe('readGitLog on a non-git directory', () => {
  let plain: string;

  beforeAll(async () => {
    plain = await mkdtemp(join(tmpdir(), 'testsmith-nogit-'));
    await mkdir(join(plain, 'src'), { recursive: true });
    await writeFile(join(plain, 'src', 'a.ts'), 'export const a = 1;\n');
  });

  afterAll(async () => {
    if (plain) await rm(plain, { recursive: true, force: true });
  });

  it('degrades to no commits + a warning rather than crashing', async () => {
    const { commits, warning } = await readGitLog(plain, 'src');
    expect(commits).toEqual([]);
    expect(warning).toMatch(/git/i);

    // Churn then seeds every candidate at 0 — never fatal.
    const churn = computeChurn(commits, ['src/a.ts'], WINDOW, REF);
    expect(churn.get('src/a.ts')).toBe(0);
  });
});
