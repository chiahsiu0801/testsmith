import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'dist', 'cli', 'cli.js');
const fixture = (name: string) => join(here, 'fixtures', name);

/** Spawn the real built CLI to prove stream routing + exit codes are wired. */
const run = (args: string[]) =>
  spawnSync('node', [cli, ...args], { cwd: root, encoding: 'utf8' });

describe('testsmith scan (end-to-end)', () => {
  beforeAll(() => {
    // The smoke tests exercise the compiled output, so ensure it exists.
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore', shell: true });
  }, 120_000);

  it('prints the stack to stdout and exits 0 on a match', () => {
    const r = run(['scan', fixture('react-vitest')]);    
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/React \+ Vitest detected/);
    expect(r.stderr).toBe('');
  });

  it('writes the friendly message to stderr and exits 1 on an unsupported stack', () => {
    const r = run(['scan', fixture('vue-jest')]);    
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/React \+ Vitest only/);
    expect(r.stdout).toBe('');
  });

  it('emits JSON to stdout with --json', () => {
    const r = run(['scan', fixture('react-vitest'), '--json']);    
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, framework: 'react' });
  });
});
