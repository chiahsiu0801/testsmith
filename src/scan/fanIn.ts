/**
 * PURE fan-in core for the scan stage (SPEC §6/§8). No fs, git, or network: the
 * input is an already-extracted, path-normalized edge list (the I/O layer in
 * {@link ./importGraph} runs dependency-cruiser and hands edges here), so every
 * counting and filtering rule is unit-testable with plain objects — mirroring
 * how {@link ./candidates} backs {@link ./enumerateSources} and how
 * {@link ./complexity} takes source text rather than touching disk.
 *
 * Fan-in = the number of DISTINCT [[candidate-source-file]]s that import a file
 * via a RUNTIME [[import-edge]] (see docs/adr/0003). Both endpoints must be
 * candidates, so edges into node_modules drop out for free (node_modules is
 * never a candidate) — the only rule needing edge metadata is the type-only
 * exclusion below.
 */

/**
 * A directed dependency between two modules. `from`/`to` are project-root-
 * relative POSIX paths (the I/O layer normalizes before constructing these, so
 * keys join cleanly onto the scanned set). `dependencyTypes` is
 * dependency-cruiser's classification, used here only to drop non-runtime edges.
 */
export interface ImportEdge {
  from: string;
  to: string;
  dependencyTypes: string[];
}

/**
 * Dependency kinds that are NOT runtime coupling and so never contribute to
 * fan-in: a TypeScript `import type`/`export type` (`type-only`) and any edge
 * that exists only before compilation (`pre-compilation-only`). Excluded by the
 * same reasoning that drops `?.` from complexity — see docs/adr/0003 and 0002.
 */
const NON_RUNTIME_TYPES = new Set(['type-only', 'pre-compilation-only']);

const isRuntimeEdge = (edge: ImportEdge): boolean =>
  !edge.dependencyTypes.some((t) => NON_RUNTIME_TYPES.has(t));

/**
 * Fan-in per candidate. Every entry in `candidates` is seeded at 0, so a file
 * imported by nobody still carries a number and no candidate is invisible to the
 * ranker. An edge bumps its target only when both endpoints are candidates and
 * the edge is runtime; importers are de-duplicated per target, so two imports of
 * a file from one module count once. Self-imports are ignored.
 */
export function computeFanIn(edges: ImportEdge[], candidates: string[]): Map<string, number> {
  const candidateSet = new Set(candidates);
  // target → set of distinct importing candidates (dedupes multi-import).
  const importers = new Map<string, Set<string>>();
  for (const file of candidates) importers.set(file, new Set());

  for (const edge of edges) {
    if (!isRuntimeEdge(edge)) continue;
    if (edge.from === edge.to) continue;
    if (!candidateSet.has(edge.from) || !candidateSet.has(edge.to)) continue;
    importers.get(edge.to)!.add(edge.from);
  }

  const fanIn = new Map<string, number>();
  for (const [file, set] of importers) fanIn.set(file, set.size);
  return fanIn;
}
