import { describe, it, expect } from 'vitest';
import { computeFanIn, type ImportEdge } from '../src/scan/fanIn.js';

/**
 * PURE counting/filtering rules for fan-in (docs/adr/0003), exercised with
 * synthetic edges so every rule is pinned independently of dependency-cruiser.
 * The end-to-end wiring (real cruise + path join + node_modules exclusion) is
 * covered separately in importGraph.test.ts against a real fixture tree.
 */

const edge = (from: string, to: string, types: string[] = ['local', 'import']): ImportEdge => ({
  from,
  to,
  dependencyTypes: types,
});

describe('computeFanIn', () => {
  it('seeds every candidate at 0 so a file imported by nobody still has a number', () => {
    const fanIn = computeFanIn([], ['a.ts', 'b.ts']);
    expect(fanIn.get('a.ts')).toBe(0);
    expect(fanIn.get('b.ts')).toBe(0);
  });

  it('counts each distinct importing candidate', () => {
    const fanIn = computeFanIn(
      [edge('b.ts', 'a.ts'), edge('c.ts', 'a.ts')],
      ['a.ts', 'b.ts', 'c.ts'],
    );
    expect(fanIn.get('a.ts')).toBe(2);
  });

  it('de-duplicates multiple imports of a file from one module → 1', () => {
    const fanIn = computeFanIn([edge('b.ts', 'a.ts'), edge('b.ts', 'a.ts')], ['a.ts', 'b.ts']);
    expect(fanIn.get('a.ts')).toBe(1);
  });

  it('counts dynamic imports and re-exports (runtime edges)', () => {
    const fanIn = computeFanIn(
      [
        edge('b.ts', 'a.ts', ['local', 'dynamic-import']),
        edge('c.ts', 'a.ts', ['local', 'export']),
      ],
      ['a.ts', 'b.ts', 'c.ts'],
    );
    expect(fanIn.get('a.ts')).toBe(2);
  });

  it('excludes type-only and pre-compilation-only edges', () => {
    const fanIn = computeFanIn(
      [
        edge('b.ts', 'a.ts', ['local', 'type-only']),
        edge('c.ts', 'a.ts', ['local', 'pre-compilation-only']),
      ],
      ['a.ts', 'b.ts', 'c.ts'],
    );
    expect(fanIn.get('a.ts')).toBe(0);
  });

  it('ignores importers that are not candidates (e.g. a test file)', () => {
    // 'a.test.ts' is not in the candidate set, so its import does not count.
    const fanIn = computeFanIn([edge('a.test.ts', 'a.ts')], ['a.ts']);
    expect(fanIn.get('a.ts')).toBe(0);
  });

  it('ignores edges whose target is not a candidate (e.g. node_modules)', () => {
    const fanIn = computeFanIn([edge('a.ts', 'node_modules/react/index.js', ['npm'])], ['a.ts']);
    expect(fanIn.has('node_modules/react/index.js')).toBe(false);
    expect(fanIn.get('a.ts')).toBe(0);
  });

  it('ignores self-imports', () => {
    const fanIn = computeFanIn([edge('a.ts', 'a.ts')], ['a.ts']);
    expect(fanIn.get('a.ts')).toBe(0);
  });

  it('counts both directions of a cycle independently', () => {
    const fanIn = computeFanIn([edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')], ['a.ts', 'b.ts']);
    expect(fanIn.get('a.ts')).toBe(1);
    expect(fanIn.get('b.ts')).toBe(1);
  });
});
