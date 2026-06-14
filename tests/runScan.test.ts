import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runScan } from '../src/cli/runScan.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('runScan (text mode)', () => {
  it('exits 0 and prints the detected stack on a match', () => {
    const r = runScan(fixture('react-vitest'), {});
    console.log('r', r);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/React \+ Vitest detected/);
    expect(r.stdout).toContain('^18.2.0');
    expect(r.stdout).toContain('^3.0.0');
    expect(r.stderr).toBe('');
  });

  it('passes vitest configured via vite.config (deps gate still passes)', () => {
    const r = runScan(fixture('vitest-via-vite-config'), {});
    expect(r.code).toBe(0);
  });

  it('emits a non-fatal warning to stderr for React < 18 but still exits 0', () => {
    const r = runScan(fixture('react16'), {});
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/React/i);
    expect(r.stderr).toMatch(/18/);
  });

  it('exits 1 with a friendly message when react is missing', () => {
    const r = runScan(fixture('no-react'), {});
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/React \+ Vitest only/);
    expect(r.stderr).toMatch(/react/);
    expect(r.stdout).toBe('');
  });

  it('names rival framework and runner when unsupported (Vue + Jest)', () => {
    const r = runScan(fixture('vue-jest'), {});
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Vue/);
    expect(r.stderr).toMatch(/Jest/);
  });

  it('exits 1 with a distinct message when package.json is missing', () => {
    const r = runScan(fixture('does-not-exist'), {});
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/No package\.json/i);
  });

  it('exits 1 with a distinct message when package.json is invalid JSON', () => {
    const r = runScan(fixture('bad-json'), {});
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/valid JSON/i);
  });
});

describe('runScan (--json mode)', () => {
  it('emits the DetectionResult to stdout on success, exit 0', () => {
    const r = runScan(fixture('react-vitest'), { json: true });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({ ok: true, framework: 'react', runner: 'vitest' });
    expect(r.stderr).toBe('');
  });

  it('emits an ok:false result with reasons on unsupported stack, exit 1', () => {
    const r = runScan(fixture('vue-jest'), { json: true });
    console.log('r', r);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reasons).toEqual(
      expect.arrayContaining([{ kind: 'missing-react' }, { kind: 'missing-vitest' }]),
    );
  });

  it('emits a file-error result as JSON on missing package.json, exit 1', () => {
    const r = runScan(fixture('does-not-exist'), { json: true });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({ ok: false, error: 'missing-package-json' });
  });
});
