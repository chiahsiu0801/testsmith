import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { readCoverage } from '../src/scan/coverageReport.js';
import { computeCoverage } from '../src/scan/coverage.js';

/**
 * Real-run acceptance (docs/adr/0005): drive the DEFAULT runner — an actual
 * `npx vitest run --coverage` with the v8 provider — over a committed fixture, and
 * prove the two things the stubbed coverageReport.test.ts can't: that Vitest's v8
 * provider really emits the istanbul-shape `statementMap`/`s` the pure core reads,
 * and that `--coverage.all` surfaces an untested candidate at 0% (an honest
 * denominator) rather than omitting it. The fixture lives under tests/fixtures/** so
 * the repo's own suite never runs it; this test spawns a nested Vitest, like
 * gitLog/importGraph spawn real git / dependency-cruiser.
 */

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'coverage-e2e');

describe('readCoverage over a real vitest coverage run (v8 provider)', () => {
  it('runs the suite once and reports real per-file line coverage', async () => {
    const { entries, ranSuite, warning } = await readCoverage(fixture, 'src');

    expect(ranSuite).toBe(true); // no committed report → the run fired
    expect(warning).toBeUndefined(); // fixture suite is green

    const candidates = ['src/add.ts', 'src/partial.ts', 'src/untested.ts'];
    const { perFile, baseline } = computeCoverage(entries, candidates);

    // Absolute report keys rebased to project-root-relative POSIX join onto candidates.
    expect([...perFile.keys()].sort()).toEqual([...candidates].sort());

    expect(perFile.get('src/add.ts')).toBe(1); // fully exercised
    expect(perFile.get('src/untested.ts')).toBe(0); // present via --coverage.all, 0% hit
    const partial = perFile.get('src/partial.ts')!; // one of three branches taken
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);

    // Lines-weighted across the scanned set, incl. the untested file's real lines.
    expect(baseline).toBeGreaterThan(0);
    expect(baseline).toBeLessThan(1);
  }, 60_000);
});
