---
name: testing-conventions
description: House conventions for writing Vitest + React Testing Library tests. Load before generating any test so output matches team style — runner, file naming, query preferences, mocking strategy, and what not to test.
---

# Testing conventions (Vitest + React Testing Library)

You are writing a test for a single source file in an existing React +
TypeScript project. Match these conventions exactly. The test MUST run green
under `vitest run` before it is accepted.

## Runner & setup

- Runner is **Vitest**. Import test APIs from `vitest`
  (`import { describe, it, expect, vi, beforeEach } from 'vitest'`).
- For components, use **React Testing Library** (`@testing-library/react`) and
  `@testing-library/user-event` for interaction. Use `@testing-library/jest-dom`
  matchers (e.g. `toBeInTheDocument`) — assume the project's setup file
  registers them.
- Do not add or modify global config, setup files, or `package.json`. Write
  only the single test file.

## File naming & location

- Co-locate: a test for `src/foo/Bar.tsx` goes in `src/foo/Bar.test.tsx`.
- One test file per source file. Use the `.test.tsx` extension for components,
  `.test.ts` for non-JSX modules.

## Query preferences (in priority order)

1. `getByRole` (with an accessible `name`) — strongly preferred.
2. `getByLabelText`, `getByPlaceholderText`, `getByText`.
3. `getByTestId` — **last resort only**, when no accessible query works.

Never assert on implementation details (class names, internal state, component
instance). Test behavior the user can observe.

## Structure

- `describe` block named after the unit under test; `it` statements phrased as
  behavior ("renders the empty state when items is empty", "calls onSubmit with
  the trimmed value").
- Arrange–act–assert. Prefer `await user.click(...)` / `user.type(...)` over
  `fireEvent`.
- Use `screen.*` queries rather than destructuring from `render`.
- Each test must contain at least one meaningful assertion. A test that renders
  without asserting observable output is unacceptable.

## Mocking strategy

- Mock at the module boundary with `vi.mock('module')`; reset with
  `vi.clearAllMocks()` in `beforeEach`.
- Mock network/data-fetching and external services; do NOT mock the component
  under test or React itself.
- Prefer passing props/fakes over deep mocking. If a component needs a
  Provider (router, query client, context), wrap it in a minimal test-only
  provider rather than mocking the hook.
- Use fake timers (`vi.useFakeTimers()`) only when the code depends on time;
  always restore them.

## What NOT to test

- Third-party library internals.
- Pure type-level code / type declarations.
- Trivial pass-through components with no logic, no conditionals, no handlers.
- Snapshot tests of large trees — prefer targeted assertions. Small inline
  snapshots are acceptable for stable, simple output.

## Example — presentational component

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmitButton } from './SubmitButton';

describe('SubmitButton', () => {
  it('renders its label', () => {
    render(<SubmitButton label="Save" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<SubmitButton label="Save" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled while loading', () => {
    render(<SubmitButton label="Save" onClick={() => {}} loading />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
```

## Example — pure utility module

```ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatCurrency';

describe('formatCurrency', () => {
  it('formats whole numbers with a currency symbol', () => {
    expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
  });

  it('rounds to two decimal places', () => {
    expect(formatCurrency(9.999, 'USD')).toBe('$10.00');
  });

  it('throws on an unknown currency code', () => {
    expect(() => formatCurrency(1, 'XYZ')).toThrow();
  });
});
```
