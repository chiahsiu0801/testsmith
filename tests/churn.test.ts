import { describe, it, expect } from 'vitest';
import { computeChurn, type CommitTouch } from '../src/scan/churn.js';

/**
 * PURE window/tallying rules for churn (docs/adr/0004), exercised with synthetic
 * commits so every rule is pinned independently of git/simple-git. The end-to-end
 * wiring (real `git log` + git-root→project-root path rebase + degradation) is
 * covered separately in gitLog.test.ts against a temp git repo with pinned dates.
 */

const REF = new Date('2026-07-01T00:00:00Z');
const WINDOW = 180;

/** Days before the reference date, as an ISO-dated CommitTouch. */
const commit = (daysAgo: number, files: string[]): CommitTouch => ({
  committedAt: new Date(REF.getTime() - daysAgo * 24 * 60 * 60 * 1000),
  files,
});

describe('computeChurn', () => {
  it('counts a commit that touches a candidate inside the window', () => {
    const churn = computeChurn([commit(10, ['a.ts'])], ['a.ts'], WINDOW, REF);
    expect(churn.get('a.ts')).toBe(1);
  });

  it('excludes a commit whose committer date is older than the window', () => {
    const churn = computeChurn([commit(200, ['a.ts'])], ['a.ts'], WINDOW, REF);
    expect(churn.get('a.ts')).toBe(0);
  });

  it('counts a file touched twice in one commit as a single unit of churn', () => {
    const churn = computeChurn([commit(10, ['a.ts', 'a.ts'])], ['a.ts'], WINDOW, REF);
    expect(churn.get('a.ts')).toBe(1);
  });

  it('seeds every candidate at 0 and reports only candidate keys', () => {
    const churn = computeChurn([], ['a.ts', 'b.ts'], WINDOW, REF);
    expect([...churn.keys()].sort()).toEqual(['a.ts', 'b.ts']);
    expect(churn.get('a.ts')).toBe(0);
    expect(churn.get('b.ts')).toBe(0);
  });

  it('tallies distinct in-window commits touching the same file', () => {
    const churn = computeChurn(
      [commit(5, ['a.ts']), commit(20, ['a.ts']), commit(60, ['a.ts'])],
      ['a.ts'],
      WINDOW,
      REF,
    );

    expect(churn.get('a.ts')).toBe(3);
  });

  it('ignores touched paths that are not candidates (e.g. a deleted or out-of-root file)', () => {
    const churn = computeChurn([commit(10, ['a.ts', 'deleted.ts'])], ['a.ts'], WINDOW, REF);

    expect(churn.has('deleted.ts')).toBe(false);
    expect(churn.get('a.ts')).toBe(1);
  });

  it('includes a commit sitting exactly on the window boundary (inclusive)', () => {
    const churn = computeChurn([commit(WINDOW, ['a.ts'])], ['a.ts'], WINDOW, REF);

    expect(churn.get('a.ts')).toBe(1);
  });
});
