# Cyclomatic complexity is the ESLint rule's set, per-function, baseline kept

The scan stage computes a per-file `complexity` signal (SPEC §6/§8) with
ts-morph. SPEC §12 leaves the exact measure open ("CC for JSX isn't perfectly
defined; pick a concrete measure and document it"). We define it as:

- **Decision-point set = the ESLint `complexity` rule's set**: `if`/`else if`,
  `for`/`for-in`/`for-of`, `while`, `do-while`, each `case` label (not
  `default`), `catch`, the ternary `?:`, and each logical `&&`, `||`, `??`.
- **Optional chaining (`?.`) is excluded**, even though each `?.` is a real
  runtime branch.
- **Per-file value = baseline 1 + every decision point in the file (including
  module scope) + one baseline per nested function unit** (function declaration,
  function expression, arrow, method, accessor, constructor). Each function unit
  is scored in isolation from 1; the file total is their sum, with module-scope
  decision points folded into the file baseline. A React component is just a
  function — no special JSX rule.

## Why

- **Explainability is a product feature** (CLAUDE.md). Adopting a published,
  battle-tested definition verbatim — rather than inventing a bespoke counting
  scheme — makes every number defensible to any JS developer and lets the README
  point at a known rule.
- **JSX needs no special handling**, dissolving the §12 worry: `{cond && <X/>}`
  and `{cond ? <A/> : <B/>}` are already a logical operator and a ternary, so a
  plain AST walk that descends into JSX expression containers Just Works.
- **`?.` excluded** because in idiomatic React it is a null-safety idiom, not
  branching logic; counting it would inflate scores with noise that does not
  reflect genuine control-flow complexity.
- **Baseline kept** so function count contributes to the score. A file with 30
  trivial functions is genuinely more surface to test than one with 3, and we
  want that reflected. This is the deliberate, surprising part of the choice.
- **Pure McCabe `E − N + 2` rejected**: faithful but requires building a
  control-flow graph per function, the numbers stop being obvious from reading
  the source (hurting both fixtures and explainability), for no ranking benefit.

## Consequences

- Every non-empty candidate scores **≥ 1**; no file is invisible to the ranker.
- "Complexity" is partly a **function-count** signal. A branch-free 30-function
  file scores 30 — intended, but a reader must know this is by design (hence
  this ADR). Per-function and per-file numbers are consistent because the file
  total is the sum either way.
- This sets the **scale every percentile rank is computed against** (SPEC §6
  normalizes by percentile rank across the scanned set). Changing the definition
  later — counting `?.`, dropping the baseline, switching to McCabe — shifts
  every file's complexity and therefore every downstream rank, so it is
  effectively a breaking change to scoring. That hard-to-reverse property is why
  it is recorded here.
