/**
 * PURE line-coverage core for the scan stage (SPEC §4.1.4, §6/§8). No fs, network,
 * or child processes: the input is an already-parsed, path-normalized list of
 * istanbul file entries (the I/O layer in {@link ./coverageReport} locates or
 * produces `coverage-final.json` and rebases its absolute keys here), so every
 * definitional rule is unit-testable with plain objects — the same pure-core /
 * thin-walker split as {@link ./churn} ↔ {@link ./gitLog} and {@link ./fanIn} ↔
 * {@link ./importGraph}.
 *
 * Line coverage = the fraction of a [[candidate-source-file]]'s executable lines
 * the suite ran, under istanbul's rule (see docs/adr/0005): a line's hit count is
 * the MAX among the statements starting on it, and `coverage = coveredLines /
 * totalLines`. The debatable definitions live here; locating/running/parsing the
 * report lives in the I/O layer.
 */

/**
 * One file's istanbul coverage, as carried in `coverage-final.json`: `statementMap`
 * maps a statement id to its source location (only `start.line` is consulted), and
 * `s` maps the same ids to hit counts. `path` is the project-root-relative POSIX
 * key the I/O layer rebased from the report's absolute path.
 */
export interface CoverageEntry {
  path: string;
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
}

export interface CoverageResult {
  /** candidate path → line coverage in [0,1]. Every candidate carries a number. */
  perFile: Map<string, number>;
  /** Lines-weighted [[baseline-coverage]] across the scanned set (SPEC §8). */
  baseline: number;
}

/** Covered/total executable lines of one file, by istanbul's max-per-line rule. */
function lineTallies(entry: CoverageEntry): { covered: number; total: number } {
  // line → the greatest hit count among statements starting on that line.
  const lineHits = new Map<number, number>();
  for (const [id, hits] of Object.entries(entry.s)) {
    const line = entry.statementMap[id]?.start.line;
    if (line === undefined) continue;
    const prev = lineHits.get(line);
    if (prev === undefined || prev < hits) lineHits.set(line, hits);
  }

  let covered = 0;
  for (const hits of lineHits.values()) if (hits > 0) covered += 1;
  return { covered, total: lineHits.size };
}

/**
 * Per-file line coverage plus the overall baseline. Every candidate is seeded so it
 * always carries a number: a candidate ABSENT from the report — no test exercises
 * it — scores 0 (SPEC "files with no test get 0"), and a candidate present with no
 * executable lines scores 1 (nothing left to cover) so it sinks in the ranking
 * rather than looking maximally risky. Non-candidate report entries are ignored.
 *
 * The baseline is lines-weighted over the scanned set — `Σ covered / Σ total` across
 * candidates — so a big untested file outweighs a tiny covered one. Files with no
 * measurable lines (absent, or present-but-empty) contribute nothing to either sum;
 * when nothing measurable remains the baseline is 0 (no coverage established), never
 * a false 1.
 */
export function computeCoverage(entries: CoverageEntry[], candidates: string[]): CoverageResult {
  const byPath = new Map(entries.map((e) => [e.path, e]));

  const perFile = new Map<string, number>();
  let globalCovered = 0;
  let globalTotal = 0;

  for (const path of candidates) {
    const entry = byPath.get(path);
    if (!entry) {
      perFile.set(path, 0); // absent → untested
      continue;
    }
    const { covered, total } = lineTallies(entry);
    perFile.set(path, total === 0 ? 1 : covered / total); // empty → nothing to cover
    globalCovered += covered;
    globalTotal += total;
  }

  return { perFile, baseline: globalTotal === 0 ? 0 : globalCovered / globalTotal };
}
