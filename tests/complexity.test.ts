import { describe, it, expect } from 'vitest';
import { computeComplexity } from '../src/scan/complexity.js';

/**
 * Acceptance criterion: known fixtures return expected complexity values.
 *
 * The metric (see docs/adr/0002 + README): file baseline 1, plus one per
 * decision point anywhere in the file (incl. module scope), plus one baseline
 * per function unit. Decision points = ESLint `complexity` set; `?.` excluded.
 * Each expected value below shows its arithmetic.
 */

// Default fixtures to .tsx so JSX parses; the `.ts` cases pass an explicit name.
const cc = (src: string, file = 'fixture.tsx') => computeComplexity(src, file);

describe('computeComplexity — Tier 1: one decision-point kind in isolation', () => {
  it('empty file is the bare baseline → 1', () => {
    expect(cc('')).toBe(1); // file 1
  });

  it('a trivial function adds only its baseline → 2', () => {
    expect(cc('function f() {}')).toBe(2); // file 1 + fn 1
  });

  it('if → 3', () => {
    expect(cc('function f(x) { if (x) return 1; }')).toBe(3); // 1 + fn 1 + if 1
  });

  it('else-if chain counts each `if` node, plain `else` is free → 4', () => {
    expect(cc('function f(x) { if (x) {} else if (x) {} else {} }')).toBe(4); // 1 + fn 1 + 2 ifs
  });

  it.each([
    ['for', 'function f() { for (;;) {} }'],
    ['for-of', 'function f(a) { for (const x of a) {} }'],
    ['for-in', 'function f(a) { for (const k in a) {} }'],
    ['while', 'function f() { while (true) {} }'],
    ['do-while', 'function f() { do {} while (true); }'],
    ['catch', 'function f() { try {} catch (e) {} }'],
  ])('%s loop/catch → 3', (_label, src) => {
    expect(cc(src)).toBe(3); // 1 + fn 1 + construct 1
  });

  it('switch counts each `case` but not `default` → 4', () => {
    const src = 'function f(x) { switch (x) { case 1: break; case 2: break; default: break; } }';
    expect(cc(src)).toBe(4); // 1 + fn 1 + 2 cases (default uncounted)
  });

  it('ternary → 3', () => {
    expect(cc('const f = (x) => (x ? 1 : 2);')).toBe(3); // 1 + arrow 1 + ternary 1
  });

  it.each([
    ['&&', 'function f(a, b) { return a && b; }'],
    ['||', 'function f(a, b) { return a || b; }'],
    ['??', 'function f(a, b) { return a ?? b; }'],
  ])('logical %s → 3', (_label, src) => {
    expect(cc(src)).toBe(3); // 1 + fn 1 + logical 1
  });

  it('each logical operator counts (chained) → 4', () => {
    expect(cc('function f(a, b, c) { return (a && b) || c; }')).toBe(4); // 1 + fn 1 + 2 logicals
  });

  it('NEGATIVE CONTROL: optional chaining is not a decision point → 2', () => {
    expect(cc('function f(a) { return a?.b?.c?.d; }')).toBe(2); // 1 + fn 1 + 0 for `?.`
  });

  it('a module-scope decision point counts against the file baseline → 2', () => {
    expect(cc('const x = a || b;', 'mod.ts')).toBe(2); // 1 + logical 1, no function
  });

  it('a file with no functions and no branches → 1', () => {
    expect(cc('const x = 1; const y = 2;', 'mod.ts')).toBe(1); // file 1 only
  });

  it('nested function units are summed (per-function isolation) → 4', () => {
    const src = `
      function useThing(ready) {
        useEffect(() => {
          if (ready) doIt();
        });
      }
    `;
    expect(cc(src, 'hook.ts')).toBe(4); // 1 + useThing 1 + arrow 1 + if 1
  });
});

describe('computeComplexity — Tier 2: realistic React components (JSX idioms compose)', () => {
  it('Badge: ternary className + `&&` render → 4', () => {
    const src = `
      function Badge({ count, active }) {
        return (
          <span className={active ? 'on' : 'off'}>
            {count > 0 && <em>{count}</em>}
          </span>
        );
      }
    `;
    // file 1 + Badge 1 + ternary 1 + && 1  (note: \`count > 0\` is relational, not a decision)
    expect(cc(src)).toBe(4);
  });

  it('List: `.map` render callback + ternary → 4', () => {
    const src = `
      function List({ items }) {
        return (
          <ul>
            {items.map((it) => (
              <li key={it.id}>{it.done ? '✓' : '–'}</li>
            ))}
          </ul>
        );
      }
    `;
    expect(cc(src)).toBe(4); // file 1 + List 1 + map arrow 1 + ternary 1
  });

  it('Panel: early-return `if`, `&&`, mapped ternary, and `||` fallback → 7', () => {
    const src = `
      function Panel({ user, items, loading }) {
        if (loading) {
          return <Spinner />;
        }
        return (
          <div>
            {user && <Header name={user.name} />}
            <ul>
              {items.map((it) =>
                it.visible ? <li key={it.id}>{it.label || 'untitled'}</li> : null
              )}
            </ul>
          </div>
        );
      }
    `;
    // file 1 + Panel 1 + map arrow 1 + if 1 + && 1 + ternary 1 + || 1
    expect(cc(src)).toBe(7);
  });
});
