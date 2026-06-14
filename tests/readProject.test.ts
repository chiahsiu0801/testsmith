import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readProject } from '../src/scan/readProject.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('readProject', () => {
  it('reads and parses package.json from the target dir', () => {
    const result = readProject(fixture('react-vitest'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pkg.dependencies?.react).toBe('^18.2.0');
    expect(result.pkg.devDependencies?.vitest).toBe('^3.0.0');
  });

  it('gathers rival runner config files as signals', () => {
    const result = readProject(fixture('vue-jest'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signals.rivalRunnerConfigs).toContain('jest.config.js');
  });

  it('returns no rival config signals when none are present', () => {
    const result = readProject(fixture('react-vitest'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signals.rivalRunnerConfigs ?? []).toEqual([]);
  });

  it('reports missing-package-json (friendly, not a throw) when absent', () => {
    const result = readProject(fixture('does-not-exist'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing-package-json');
  });

  it('reports invalid-package-json on malformed JSON', () => {
    const result = readProject(fixture('bad-json'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-package-json');
  });
});
