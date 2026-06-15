import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enumerateSources } from '../src/scan/enumerateSources.js';
import type { CandidateConfig } from '../src/scan/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

const config = (over: Partial<CandidateConfig> = {}): CandidateConfig => ({
  sourceRoot: 'src',
  ignore: ['**/*.stories.tsx', 'src/generated/**'],
  ...over,
});

describe('enumerateSources', () => {
  it('returns exactly the candidate source files from a fixture tree, sorted', () => {
    const result = enumerateSources(fixture('enumerate'), config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toEqual([
      'src/components/Button.tsx',
      'src/config.ts',
      'src/index.js',
      'src/latest.ts',
      'src/utils/math.ts',
    ]);
  });

  it('excludes generated-by-default dirs but needs an ignore glob for project-specific ones', () => {
    const result = enumerateSources(fixture('enumerate'), config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // __generated__ is excluded by the built-in segment list...
    expect(result.files).not.toContain('src/__generated__/types.ts');
    // ...whereas src/generated/ is only excluded because of the ignore glob.
    const withoutIgnore = enumerateSources(fixture('enumerate'), config({ ignore: [] }));
    expect(withoutIgnore.ok).toBe(true);
    if (!withoutIgnore.ok) return;
    expect(withoutIgnore.files).toContain('src/generated/schema.ts');
    expect(withoutIgnore.files).toContain('src/Button.stories.tsx');
  });

  it('reports a friendly missing-source-root result instead of throwing', () => {
    // react-vitest fixture has a package.json but no src/ directory.
    const result = enumerateSources(fixture('react-vitest'), config());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing-source-root');
    expect(result.path).toContain('src');
  });

  it('treats an existing-but-empty source root as a valid empty scanned set', () => {
    const result = enumerateSources(fixture('enumerate'), config({ sourceRoot: 'src/types' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toEqual([]); // only api.d.ts lives there, and it's excluded
  });
});
