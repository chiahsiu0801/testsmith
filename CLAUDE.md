# Testsmith

CLI that ranks source files by test-risk, generates Vitest+RTL tests via the
Claude Agent SDK in a verify loop, and reports coverage delta. Full spec in
`SPEC.md` — read it before non-trivial work.

## Architecture invariants (do not violate)

- Five stages: **scan → score → select → generate → report**. Each stage
  communicates ONLY via the types in SPEC §8. Don't leak scan/git logic into
  score, UI concerns into generate, etc.
- `src/score/` is **PURE**: no fs, git, network, or SDK calls. Input is
  `TargetFile[]`, output is `ScoredTarget[]`. This is the demo centerpiece and
  must stay trivially unit-testable. If you reach for I/O here, it belongs in
  `src/scan/` instead.
- Every `ScoredTarget` carries a `breakdown` + a one-line `reason`.
  Explainability is a feature — never collapse it to a bare number.
- Normalization is **percentile rank** across the scanned set, not min–max
  (robust to a single outlier file). Document the choice where it lives.

## Scope discipline (v1)

- React + Vitest + React Testing Library **ONLY**. Do not scaffold
  Vue/Svelte/Jest/Playwright, even speculatively.
- **NEVER rewrite or edit an existing human test.** v1 only ADDS tests for
  files with no/low coverage.
- The tool is **never destructive**: all generated tests land on a dedicated
  branch/worktree and are reviewed before merge. No writes to the user's
  working tree or existing files.

## Agent SDK

- Package is `@anthropic-ai/claude-agent-sdk` (the renamed Claude Code SDK),
  Node 18+.
- Do NOT invent SDK APIs from memory — the SDK postdates the training cutoff.
  Verify against current docs; use the `claude-api` skill when touching SDK
  code.
- The conventions skill the agent consumes lives at
  `skills/testing-conventions/SKILL.md` and is wired in via the agent's
  `skills` field. Treat it as a product feature, not config.

## How we build

- TDD the score module first (percentile-rank normalization + weighting + the
  hotspot mode). Use the `tdd` skill. The test tool should have excellent tests.
- Build vertical slices in SPEC §10 order: **scan → score → agent → loop**
  BEFORE the Ink UI. Each milestone must be independently demoable.
- Keep an `examples/` fixture React repo with uneven coverage and one obvious
  churn+complexity hotspot, so `testsmith scan` and the verify loop have
  something real to run against in a demo.

## Commands

<!-- Fill in once scaffolded: -->
- Build:      `npm run build`
- Test:       `npx vitest run`
- Lint:       `npm run lint`
- Run CLI:    `node dist/cli.js scan` (or via the bin once linked)
