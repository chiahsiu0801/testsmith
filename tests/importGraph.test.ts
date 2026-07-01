import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildImportGraph } from '../src/scan/importGraph.js';
import { computeFanIn } from '../src/scan/fanIn.js';
import { enumerateSources } from '../src/scan/enumerateSources.js';

/**
 * End-to-end acceptance for fan-in: a fixture with a KNOWN import structure
 * returns the correct counts, and external / node_modules imports are excluded.
 * Proves the dependency-cruiser wiring, tsconfig-alias resolution, and the
 * path-join onto the scanned set — the parts the pure fanIn.test.ts can't reach.
 */

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fanin');

describe('fan-in over a real fixture tree', () => {
  it('enumeration and fan-in agree on the candidate keys', async () => {
    const enumeration = enumerateSources(fixtureRoot, { sourceRoot: 'src', ignore: [] });

    expect(enumeration.ok).toBe(true);
    if (!enumeration.ok) return;

    const edges = await buildImportGraph(fixtureRoot, 'src');

    const fanIn = computeFanIn(edges, enumeration.files);

    // Every scanned candidate carries a fan-in number; nothing else leaks in.
    expect([...fanIn.keys()].sort()).toEqual([...enumeration.files].sort());
  });

  it('returns the known fan-in counts, excluding type-only / test / node_modules edges', async () => {
    const edges = await buildImportGraph(fixtureRoot, 'src');
    const candidates = [
      'src/App.tsx',
      'src/components/Button.tsx',
      'src/components/Card.tsx',
      'src/components/index.ts',
      'src/leaf.ts',
      'src/lib/types.ts',
      'src/utils/format.ts',
    ];
    const fanIn = computeFanIn(edges, candidates);

    expect(Object.fromEntries(fanIn)).toEqual({
      // imported by Button (via @/ alias), Card, App
      'src/utils/format.ts': 3,
      // imported by Card, App, and the index.ts barrel re-export
      'src/components/Button.tsx': 3,
      // imported by App
      'src/components/Card.tsx': 1,
      // imported ONLY type-only by Button → 0
      'src/lib/types.ts': 0,
      // imported ONLY by leaf.test.ts (not a candidate) → 0
      'src/leaf.ts': 0,
      // imported by nobody → 0
      'src/App.tsx': 0,
      'src/components/index.ts': 0,
    });
  });
});
