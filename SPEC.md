# Testsmith — Spec

> A CLI tool that helps frontend teams backfill test coverage using an AI agent.
> It finds the code most worth testing, generates tests for it with Claude Code,
> verifies those tests actually pass, and reports the improvement.

_(“Testsmith” is a working name — swap it for whatever you like.)_

---

## 1. Problem

When a project adopts a testing framework late — after months or years of
iteration — backfilling tests is painful and rarely gets finished. There's too
much surface area, no obvious starting point, and writing tests for code you
didn't just write is slow and unrewarding. Teams either give up or test the
wrong things.

AI coding agents change the economics of this. The mechanical work of writing a
test is now cheap. But that surfaces two questions the agent can't answer on its
own, and those questions are the actual product:

1. **What is worth testing first?** Coverage percentage is a vanity metric. A
   ranking that reflects real risk is what makes the effort pay off.
2. **Did the generated test actually do anything?** A test that passes but
   asserts nothing is worse than no test, because it gives false confidence.

Testsmith is the layer around the agent that answers both: a risk-based
prioritizer in front, and a verification loop behind.

---

## 2. Goals & non-goals

### MVP goals

- Scan a TypeScript React project and inventory its source files.
- Rank source files by a transparent, explainable risk score.
- Let the user select which files to generate tests for (interactive list).
- Generate a test per selected file via the Claude Agent SDK, using a
  generate → run → fix loop so output is verified green before it's kept.
- Report the coverage delta and show the diff for review.
- Target **Vitest + React Testing Library** only.

### MVP non-goals (explicitly out of scope for v1)

- Frameworks other than React; runners other than Vitest.
- E2E / Playwright tests.
- Mutation testing (stretch — see §11).
- Auto-merging or opening PRs (stretch — see §11).
- Editing existing tests. v1 only _adds_ tests for files that have none or are
  under-covered; it never rewrites a human's test.

---

## 3. Tech stack

| Concern              | Choice                           | Why                                                                                        |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| Language / runtime   | TypeScript on Node 18+           | Ecosystem fit; SDK requires Node 18+.                                                      |
| CLI arg parsing      | `commander`                      | Small, standard.                                                                           |
| Interactive UI       | `ink`                            | React in the terminal — natural fit for a frontend tool.                                   |
| AST analysis         | `ts-morph`                       | Ergonomic wrapper over the TS compiler API.                                                |
| Dependency graph     | `dependency-cruiser`             | Mature, configurable import-graph extraction.                                              |
| Git signals          | `simple-git`                     | Churn analysis + branch/worktree isolation.                                                |
| Agent engine         | `@anthropic-ai/claude-agent-sdk` | Same engine as Claude Code, exposed programmatically; supports skills, hooks, permissions. |
| Test runner (target) | `vitest` (project's own)         | What we generate for and run against.                                                      |

The Agent SDK is the former “Claude Code SDK” — the same runtime Claude Code
uses, packaged as a TypeScript library you can script into a pipeline. It
bundles its own native binary, so the target project doesn't need Claude Code
installed separately.

---

## 4. Architecture

A five-stage pipeline. Each stage has a clean input/output so stages can be run
and tested independently.

```
  scan ──▶ score ──▶ select ──▶ generate (verify loop) ──▶ report
   │         │          │              │                      │
inventory  ranked   user picks    tests written &        coverage delta
of files   targets   subset       verified green         + diffs
```

### 4.1 Scan

1. **Detect** the framework and runner by reading `package.json` and config
   files. Bail with a clear message if it isn't React + Vitest (v1 constraint).
2. **Enumerate** candidate source files: `.ts/.tsx/.js/.jsx` under the source
   root, excluding test files (`*.test.*`, `*.spec.*`, `__tests__`), type
   declarations, config, generated output, `node_modules`, and anything matched
   by the user's ignore globs.
3. **Build the import graph** with dependency-cruiser to compute fan-in per
   file.
4. **Baseline coverage**: read an existing coverage report if present,
   otherwise run the existing suite once with `--coverage` to capture a
   starting point. Files with no test get a coverage of 0.

Output: a `ScanResult` (see §8).

### 4.2 Score

The core ranking. See §6 for the full algorithm. Output: candidates sorted
descending by score, each carrying a human-readable breakdown of _why_.

### 4.3 Select

An Ink-rendered, checkbox multi-select list. Each row shows the file, its score,
the one-line reason ("high churn · 12 branches · imported by 30 modules · 0%
covered"), and an effort hint. Defaults to the top N pre-checked. A
non-interactive path (`--top N --yes`) skips the UI for CI use.

### 4.4 Generate (the verify loop)

For each selected target, in an isolated git branch/worktree:

```
attempt = 0
context = none
loop:
    test = agent.writeTestFor(target, conventions=SKILL.md, failure=context)
    result = run `vitest run <testFile> --coverage`
    if result.passed:
        record coverage delta for target
        keep the test
        break
    attempt += 1
    if attempt >= maxAttempts:
        discard the test, mark target as FAILED
        break
    context = result.failureOutput   # fed back to the agent next iteration
```

Why a loop: tests give an unambiguous pass/fail signal, which is exactly what an
agentic loop needs to self-correct. This is what turns "the AI wrote something"
into "the AI wrote something that runs and passes," and it's the most important
piece of engineering in the tool.

Isolation: every run happens on a dedicated branch (or `git worktree`) so the
tool is never destructive and the user reviews before merging.

### 4.5 Report

- Overall coverage before vs. after, and per-file deltas for the targets.
- `git diff` of the added test files.
- A summary table: per target → passed/failed, attempts used, coverage gained.
- Optionally re-run the score so the user can see the hotspots are now covered.

---

## 5. Conventions: the testing skill

To keep generated tests consistent with house style, the agent is given a
`SKILL.md` describing the team's testing conventions — runner, file naming,
RTL query preferences (`getByRole` over `getByTestId`, etc.), mocking strategy,
what _not_ to test, and a couple of exemplar tests. The Agent SDK accepts a
`skills` field on an agent definition, so this wires in directly.

v1 ships a sensible default skill for Vitest + RTL and lets the user point at
their own. (Generating the skill from the existing test suite is a stretch
goal.)

---

## 6. The scoring algorithm

The ranking must be **explainable** — for any file you should be able to say in
one sentence why it ranked where it did. Four signals, each normalized to
`[0,1]`, then combined.

| Signal        | Definition                                                      | Source             |
| ------------- | --------------------------------------------------------------- | ------------------ |
| `churn`       | # commits touching the file in the last _D_ days (default 180)  | git log            |
| `complexity`  | cyclomatic complexity (sum across functions/components in file) | ts-morph           |
| `fanIn`       | # internal modules that import the file                         | dependency-cruiser |
| `coverageGap` | `1 − lineCoverage` (0 = fully covered, 1 = untested)            | coverage report    |

**Normalization.** Use percentile rank across the scanned set rather than raw
min–max — it's robust to a single huge outlier file dominating the scale.

**Combination.** The default is a weighted sum:

```
score = w_churn·churn + w_complexity·complexity + w_fanIn·fanIn + w_coverage·coverageGap
```

with default weights `{ churn: 0.3, complexity: 0.25, fanIn: 0.2, coverage: 0.25 }`,
all user-overridable in config.

**Hotspot refinement (recommended).** Churn and complexity are most meaningful
_together_ — frequently-changed _and_ complex code is the classic high-risk
hotspot. So an alternative scoring mode multiplies them as an interaction term:

```
hotspot = churn · complexity
score   = w_hotspot·hotspot + w_fanIn·fanIn + w_coverage·coverageGap
```

Ship the additive version as the default for simplicity; expose hotspot mode
behind a flag. Either way, `coverageGap` near 0 should pull a file toward the
bottom — there's little value in testing what's already tested.

Each candidate carries a `ScoreBreakdown` so the UI and report can show the
contributing factors, not just the final number.

---

## 7. CLI surface

```
testsmith scan                 # analyze + print the ranked report, no generation
testsmith run                  # full interactive flow: scan → select → generate → report
testsmith run --top 5 --yes    # non-interactive: take top 5, no prompts (CI)
testsmith run --dry-run        # rank + show what would be generated, but don't call the agent

Global flags:
  --config <path>        # default: ./.testsmith.json
  --max-attempts <n>     # verify-loop cap per file (default 3)
  --branch <name>        # branch/worktree to write tests on (default: testsmith/<timestamp>)
  --weights <json>       # override scoring weights
```

---

## 8. Config & data model

### Config file (`.testsmith.json`)

```json
{
  "sourceRoot": "src",
  "ignore": ["**/*.stories.tsx", "src/generated/**"],
  "churnWindowDays": 180,
  "weights": {
    "churn": 0.3,
    "complexity": 0.25,
    "fanIn": 0.2,
    "coverage": 0.25
  },
  "scoringMode": "additive",
  "maxAttempts": 3,
  "skillPath": "./skills/testing-conventions/SKILL.md"
}
```

### Core types (sketch)

```ts
interface TargetFile {
  path: string;
  churn: number; // raw commit count in window
  complexity: number; // raw cyclomatic complexity
  fanIn: number; // raw importer count
  lineCoverage: number; // 0..1, baseline
}

interface ScoreBreakdown {
  churn: number;
  complexity: number;
  fanIn: number;
  coverageGap: number; // normalized 0..1
}

interface ScoredTarget extends TargetFile {
  score: number;
  breakdown: ScoreBreakdown;
  reason: string; // one-line human explanation
}

interface ScanResult {
  framework: 'react';
  runner: 'vitest';
  baselineCoverage: number;
  targets: ScoredTarget[];
}

interface GenerationResult {
  target: string;
  status: 'passed' | 'failed';
  attempts: number;
  testFile?: string;
  coverageBefore: number;
  coverageAfter: number;
}

interface RunReport {
  branch: string;
  overallBefore: number;
  overallAfter: number;
  results: GenerationResult[];
}
```

---

## 9. Suggested project structure

```
src/
  cli/        # commander setup + command handlers
  scan/       # framework detection, ts-morph analysis, dep graph, coverage read
  score/      # normalization + scoring engine (pure, easy to unit-test)
  ui/         # ink components for the select step + progress
  agent/      # Agent SDK wrapper + the verify loop + git isolation
  report/     # coverage diff + output rendering
  config/     # load/validate config
skills/
  testing-conventions/SKILL.md   # default Vitest + RTL conventions
```

Keep `score/` a pure module with no I/O — it's the most interesting logic and
the easiest thing to demonstrate with its own tests (nice symmetry: the test
tool has good tests).

---

## 10. Build order (MVP milestones)

1. **Scan, read-only.** `testsmith scan` prints an unranked file inventory with
   raw churn / complexity / fanIn / coverage. Proves the analysis works.
2. **Score.** Add normalization + weighting; `scan` now prints a ranked table
   with reasons. This is a complete, demoable artifact on its own.
3. **Agent, single file, no loop.** Generate one test for one hard-coded target
   and write it to a branch. Proves the SDK integration.
4. **Verify loop.** Wrap generation in the run → fix → retry loop with the
   attempts cap.
5. **Select UI.** Ink multi-select between score and generate.
6. **Report.** Coverage delta + diff.

Each milestone is independently demoable — build the thin vertical slice through
1–4 before polishing the UI.

---

## 11. Stretch goals (post-MVP)

- **Mutation testing** (Stryker) as a quality gate. Coverage says a line _ran_;
  mutation testing says the test would actually _catch a bug_. This directly
  attacks the biggest weakness of AI-generated tests (passing-but-meaningless
  assertions) and is the strongest single thing you can add to show you care
  about test quality, not test quantity.
- **CI mode + PR.** Run non-interactively on a schedule, open a PR with the new
  tests and the coverage delta in the description.
- **Skill generation.** Infer the conventions skill from the project's existing
  tests instead of shipping a default.
- **Multi-framework / multi-runner.** Vue/Svelte; Jest; Playwright for E2E.
- **Cost controls.** Show estimated token cost before a run and cap spend; note
  that programmatic Agent SDK usage is metered separately from interactive
  Claude Code, so a frugal/dry-run mode is worth having.

---

## 12. Risks & open questions

- **Test quality vs. quantity.** The verify loop guarantees _green_, not
  _meaningful_. Until mutation testing lands, a green test could still be weak.
  Be honest about this — it's the right thing to raise unprompted.
- **Components with heavy side effects** (network, context, routing) are hard to
  test in isolation and may exhaust the attempt budget. Pure utilities and
  presentational components are the high-value early wins; consider weighting
  toward them in v1.
- **Cyclomatic complexity for JSX** isn't perfectly defined; pick a concrete
  measure (e.g. branch + logical-operator count per function) and document it.
- **Cost & latency.** Each target is one or more full agent runs. The
  attempts cap and dry-run mode are the main levers.
- **Flaky baselines.** If the existing suite is already flaky, coverage deltas
  get noisy. Detect and warn.
