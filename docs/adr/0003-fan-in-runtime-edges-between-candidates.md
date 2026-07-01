# Fan-in counts runtime edges between candidates; type-only and external excluded

The scan stage computes a per-file `fanIn` signal (SPEC §6/§8) — "# internal
modules that import the file" — with dependency-cruiser. The SPEC fixes the
external/node_modules exclusion but leaves two judgement calls open. We define
fan-in as:

- **Both endpoints must be candidate source files.** An import counts toward a
  file's fan-in only when the importer is itself in the scanned set (reuse
  `isCandidate`/`filterCandidates`). Test files, config, stories, and
  `node_modules` are never importers for this purpose.
- **Runtime edges only; `type-only` imports excluded.** Plain `import`, dynamic
  `import()`, and re-exports (`export … from`) count. An `import type { … }`
  edge does not.
- **Distinct importers.** Fan-in counts distinct importing modules, not import
  statements: two imports of a file from one module are one unit of fan-in.
- A file imported by nobody — or only via excluded edges — scores **0**, and
  every candidate is seeded at 0 so it always carries a number.

## Why

- **Excluding test-file importers keeps fan-in orthogonal to coverage.** The
  ranker already has a `coverageGap` signal; if a `Button.test.tsx` importing
  `Button.tsx` raised `Button`'s fan-in, then *having a test* would push a file
  *up* the test-priority ranking — backwards for a tool that targets
  under-tested code. Requiring both endpoints to be candidates removes that
  feedback loop and makes fan-in mean "internal **production** fan-in."
- **node_modules exclusion falls out for free.** Because candidate enumeration
  already excludes `node_modules` (see candidates.ts / ADR 0001), "both endpoints
  are candidates" excludes external imports without a separate rule — the pure
  core needs no node_modules knowledge at all.
- **`type-only` excluded, by analogy to `?.` in ADR 0002.** Fan-in is a proxy
  for *runtime* blast radius. A file imported only for its types creates no
  runtime coupling; counting type-only edges would inflate fan-in with
  compile-time-only noise, exactly as counting `?.` would have inflated
  complexity with null-safety noise. We keep the two metrics philosophically
  consistent: both measure genuine runtime behaviour, not type ceremony.
- **Distinct importers** matches the SPEC wording ("# internal modules") and
  keeps the number an intuitive "how many places depend on this," not a
  statement tally.

## Consequences

- Fan-in is reported **only for keys in the scanned set**; the I/O layer
  (`importGraph.ts`) normalizes dependency-cruiser's cwd-relative, OS-separator
  paths to project-root-relative POSIX before counting, so the result joins
  cleanly onto the enumerated candidates. A keying mismatch would silently zero
  every count, so the integration test asserts keys against `enumerateSources`.
- The **type-only rule lives in the pure core**: `ImportEdge` carries
  `dependencyTypes`, and `computeFanIn` drops edges tagged `type-only`. This
  keeps the one genuinely debatable rule unit-testable with synthetic edges.
- Like complexity, this **sets the scale every percentile rank is computed
  against** (SPEC §6). Changing the definition later — counting type-only edges,
  counting test importers — shifts every file's fan-in and therefore every
  downstream rank. That hard-to-reverse property is why it is recorded here.
- Unresolved imports (e.g. a `tsconfig` path alias that doesn't resolve) are
  dropped, which *undercounts* fan-in. We pass dependency-cruiser the project's
  `tsConfig` when present to minimize this, and defer a `couldNotResolve`
  warning to a later milestone.
