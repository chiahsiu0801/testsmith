# Testsmith

Testsmith is a CLI that helps frontend teams backfill test coverage. It ranks a
TypeScript + React project's source files by **test-risk**, generates
Vitest + React Testing Library tests for the riskiest files via the Claude Agent
SDK in a verify loop, and reports the coverage delta. The ranking is the point:
it tells you _what is worth testing first_ and explains, in one line per file,
_why_.

See [`SPEC.md`](./SPEC.md) for the full design and [`CONTEXT.md`](./CONTEXT.md)
for the project glossary.

## How files are scored

Each candidate source file is ranked by four signals, each normalized by
**percentile rank** across the scanned set (robust to a single outlier file) and
combined into one explainable score:

| Signal        | Meaning                                                  | Source             |
| ------------- | -------------------------------------------------------- | ------------------ |
| `churn`       | commits touching the file in the last _D_ days           | git log            |
| `complexity`  | cyclomatic complexity, summed over the file (see below)  | ts-morph           |
| `fanIn`       | internal modules that import the file                    | dependency-cruiser |
| `coverageGap` | `1 − lineCoverage` (0 = fully covered, 1 = untested)     | coverage report    |

### Complexity

Cyclomatic complexity is computed from the AST with
[`ts-morph`](https://ts-morph.com). Because the textbook definition is ambiguous
for JSX (SPEC §12), Testsmith pins a concrete, ESLint-aligned measure. The
rationale and trade-offs are recorded in
[ADR 0002](./docs/adr/0002-cyclomatic-complexity-definition.md).

**Definition.** A file's complexity is:

```
complexity = 1                            # file baseline
           + 1 per decision point         # anywhere in the file, incl. module scope
           + 1 per function unit          # each function's own baseline
```

A **decision point** is any of the following — the [ESLint `complexity`
rule](https://eslint.org/docs/latest/rules/complexity)'s set:

| Construct                              | Counts | Note                                          |
| -------------------------------------- | :----: | --------------------------------------------- |
| `if` / `else if`                       |   ✅   | each `if` node; a plain `else` is free        |
| `for` / `for-in` / `for-of`            |   ✅   |                                               |
| `while` / `do-while`                   |   ✅   |                                               |
| `case` label                           |   ✅   | each label; **`default` does not count**      |
| `catch`                                |   ✅   |                                               |
| ternary `?:`                           |   ✅   |                                               |
| logical `&&`, `\|\|`, `??`             |   ✅   | each operator                                 |
| optional chaining `?.`                 |   ❌   | a null-safety idiom, not branching logic      |

A **function unit** is a function declaration, function expression, arrow
function, class method, accessor (`get`/`set`), or constructor. Each contributes
a baseline of `1`. A React component is just a function, so it gets no special
case.

**JSX needs no special rule.** The two conditional-rendering idioms are already
covered: `{cond && <X/>}` is a logical operator and `{cond ? <A/> : <B/>}` is a
ternary. The AST walk descends into JSX expressions like any other node.

**Worked example** (scores `7`):

```tsx
function Panel({ user, items, loading }) {   // +1 function unit
  if (loading) {                             // +1 if
    return <Spinner />;
  }
  return (
    <div>
      {user && <Header name={user.name} />}  // +1 &&
      <ul>
        {items.map((it) =>                   // +1 function unit (arrow)
          it.visible ? (                     // +1 ternary
            <li key={it.id}>{it.label || 'untitled'}</li>  // +1 ||
          ) : null
        )}
      </ul>
    </div>
  );
}
// 1 (file) + 2 function units + 4 decision points = 7
```

**Consequences of this choice:**

- Every non-empty candidate scores **≥ 1** — no file is invisible to the ranker.
- Complexity is partly a **function-count** signal: a file with 30 trivial
  functions scores 30, by design — more functions is more surface to test.
- This is the **scale every complexity percentile rank is computed against**, so
  changing the definition shifts every downstream rank (see ADR 0002).

## Commands

```
npm run build        # compile to dist/
npx vitest run       # run the test suite
npm run lint         # eslint src
node dist/cli.js scan
```
