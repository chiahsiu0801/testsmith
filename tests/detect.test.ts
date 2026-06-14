import { describe, it, expect } from 'vitest';
import { detectStack } from '../src/scan/detect.js';
import type { PackageJson } from '../src/scan/types.js';

const pkg = (over: PackageJson = {}): PackageJson => over;

describe('detectStack', () => {
  it('matches when react and vitest are both present (deps gate)', () => {
    const result = detectStack(
      pkg({ dependencies: { react: '^18.2.0' }, devDependencies: { vitest: '^3.0.0' } })
    );
    expect(result).toEqual({
      ok: true,
      framework: 'react',
      runner: 'vitest',
      reactVersion: '^18.2.0',
      vitestVersion: '^3.0.0',
      warnings: [],
    });
  });

  it('accepts react/vitest from either dependencies or devDependencies', () => {
    const result = detectStack(
      pkg({ devDependencies: { react: '18.3.1', vitest: '3.1.0' } })
    );
    expect(result.ok).toBe(true);
  });

  it('fails with missing-react when react is absent', () => {
    const result = detectStack(pkg({ devDependencies: { vitest: '^3.0.0' } }));
    expect(result).toEqual({ ok: false, reasons: [{ kind: 'missing-react' }] });
  });

  it('fails with missing-vitest when vitest is absent', () => {
    const result = detectStack(pkg({ dependencies: { react: '^18.0.0' } }));
    expect(result).toEqual({ ok: false, reasons: [{ kind: 'missing-vitest' }] });
  });

  it('reports ALL problems at once (Vue + Jest)', () => {
    const result = detectStack(
      pkg({ dependencies: { vue: '^3.4.0' }, devDependencies: { jest: '^29.0.0' } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // both the missing gates and the rival enrichments are surfaced
    expect(result.reasons).toContainEqual({ kind: 'missing-react' });
    expect(result.reasons).toContainEqual({ kind: 'missing-vitest' });
    expect(result.reasons).toContainEqual({ kind: 'rival-framework', found: 'vue' });
    expect(result.reasons).toContainEqual({ kind: 'rival-runner', found: 'jest' });
  });

  it('enriches a missing-vitest failure with the rival runner found in deps', () => {
    const result = detectStack(
      pkg({ dependencies: { react: '^18.0.0' }, devDependencies: { mocha: '^10.0.0' } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContainEqual({ kind: 'missing-vitest' });
    expect(result.reasons).toContainEqual({ kind: 'rival-runner', found: 'mocha' });
    // react is present, so no missing-react
    expect(result.reasons).not.toContainEqual({ kind: 'missing-react' });
  });

  it('enriches via config-file signals when a rival runner is not a dependency', () => {
    const result = detectStack(pkg({ dependencies: { react: '^18.0.0' } }), {
      rivalRunnerConfigs: ['jest.config.js'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContainEqual({ kind: 'missing-vitest' });
    expect(result.reasons).toContainEqual({ kind: 'rival-runner', found: 'jest' });
  });

  it('warns (non-fatal) when React is detectably < 18', () => {
    const result = detectStack(
      pkg({ dependencies: { react: '^16.14.0' }, devDependencies: { vitest: '^3.0.0' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/React/i);
    expect(result.warnings[0]).toMatch(/18/);
  });

  it('does not warn when the React version range is not cheaply parseable', () => {
    const result = detectStack(
      pkg({ dependencies: { react: 'workspace:*' }, devDependencies: { vitest: '^3.0.0' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
  });
});
