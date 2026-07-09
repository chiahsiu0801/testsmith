import { describe, it, expect } from 'vitest';
import { computeCoverage, type CoverageEntry } from '../src/scan/coverage.js';

/**
 * PURE line-coverage rules (docs/adr/0005), exercised with synthetic istanbul
 * entries so every rule is pinned independently of Vitest and the on-disk report.
 * The end-to-end wiring (locate/produce coverage-final.json + absolute→project-root
 * path rebase + single-run + degradation) is covered separately in
 * coverageReport.test.ts against a temp React+Vitest fixture.
 */

/** Build one file's istanbul entry from `[line, hits]` statement pairs. */
const entry = (path: string, statements: Array<[line: number, hits: number]>): CoverageEntry => {
  const statementMap: Record<string, { start: { line: number } }> = {};
  const s: Record<string, number> = {};
  statements.forEach(([line, hits], i) => {
    statementMap[i] = { start: { line } };
    s[i] = hits;
  });
  return { path, statementMap, s };
};

describe('computeCoverage — per-file line coverage', () => {
  it('scores a fully-hit file at 1', () => {
    const { perFile } = computeCoverage([entry('a.ts', [[1, 1], [2, 3]])], ['a.ts']);
    expect(perFile.get('a.ts')).toBe(1);
  });

  it('scores a partially-hit file as coveredLines / totalLines', () => {
    const { perFile } = computeCoverage(
      [entry('a.ts', [[1, 1], [2, 0], [3, 1]])],
      ['a.ts'],
    );
    expect(perFile.get('a.ts')).toBeCloseTo(2 / 3);
  });

  it('counts a line covered if ANY statement on it ran (istanbul max-per-line rule)', () => {
    // Two statements share line 5: one unhit, one hit → the line is covered.
    const { perFile } = computeCoverage([entry('a.ts', [[5, 0], [5, 2]])], ['a.ts']);
    expect(perFile.get('a.ts')).toBe(1);
  });

  it('counts a line uncovered only if EVERY statement on it is unhit', () => {
    const { perFile } = computeCoverage(
      [entry('a.ts', [[5, 0], [5, 0], [6, 1]])],
      ['a.ts'],
    );
    expect(perFile.get('a.ts')).toBe(1 / 2); // line 5 uncovered, line 6 covered
  });

  it('seeds an absent candidate at 0 and reports only candidate keys', () => {
    const { perFile } = computeCoverage([], ['a.ts', 'b.ts']);
    expect([...perFile.keys()].sort()).toEqual(['a.ts', 'b.ts']);
    expect(perFile.get('a.ts')).toBe(0);
    expect(perFile.get('b.ts')).toBe(0);
  });

  it('scores a present-but-empty file (no executable lines) at 1', () => {
    const { perFile } = computeCoverage([entry('barrel.ts', [])], ['barrel.ts']);
    expect(perFile.get('barrel.ts')).toBe(1);
  });

  it('ignores report entries that are not candidates', () => {
    const { perFile } = computeCoverage([entry('x.ts', [[1, 1]])], ['a.ts']);
    expect(perFile.has('x.ts')).toBe(false);
    expect(perFile.get('a.ts')).toBe(0);
  });
});

describe('computeCoverage — baseline aggregate', () => {
  it('is lines-weighted across the scanned set, not a mean of percentages', () => {
    // a.ts: 1/1 covered; b.ts: 0/3 covered → 1 of 4 lines → 0.25 (a mean would be 0.5).
    const { baseline } = computeCoverage(
      [entry('a.ts', [[1, 1]]), entry('b.ts', [[1, 0], [2, 0], [3, 0]])],
      ['a.ts', 'b.ts'],
    );
    expect(baseline).toBe(0.25);
  });

  it('excludes empty files from the denominator', () => {
    const { baseline } = computeCoverage(
      [entry('barrel.ts', []), entry('b.ts', [[1, 1]])],
      ['barrel.ts', 'b.ts'],
    );
    expect(baseline).toBe(1);
  });

  it('excludes absent candidates from the denominator (documented limitation)', () => {
    const { baseline } = computeCoverage([entry('a.ts', [[1, 1], [2, 0]])], ['a.ts', 'c.ts']);
    expect(baseline).toBe(0.5); // c.ts contributes no known lines
  });

  it('is 0 when no candidate has measurable lines', () => {
    const { baseline } = computeCoverage([], ['a.ts']);
    expect(baseline).toBe(0);
  });
});
