import { detectStack } from '../scan/detect.js';
import { readProject } from '../scan/readProject.js';
import type { DetectionFailure, DetectionResult } from '../scan/types.js';

export interface ScanOptions {
  json?: boolean;
}

export interface ScanOutput {
  code: number;
  stdout: string;
  stderr: string;
}

const RIVAL_LABEL: Record<string, string> = {
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
  preact: 'Preact',
  jest: 'Jest',
  mocha: 'Mocha',
  jasmine: 'Jasmine',
  ava: 'Ava',
};

function formatSuccess(result: Extract<DetectionResult, { ok: true }>): ScanOutput {
  const stdout =
    `✓ React + Vitest detected.\n` +
    `  react   ${result.reactVersion}\n` +
    `  vitest  ${result.vitestVersion}\n`;
  const stderr = result.warnings.map((w) => `⚠ ${w}\n`).join('');
  return { code: 0, stdout, stderr };
}

function formatUnsupported(reasons: DetectionFailure[]): ScanOutput {
  const missing: string[] = [];
  if (reasons.some((r) => r.kind === 'missing-react')) missing.push('react');
  if (reasons.some((r) => r.kind === 'missing-vitest')) missing.push('vitest');

  const found = reasons
    .filter((r) => r.kind === 'rival-framework' || r.kind === 'rival-runner')
    .map((r) => RIVAL_LABEL[r.found] ?? r.found);

  let stderr = `✗ Testsmith v1 supports React + Vitest only.\n`;
  if (missing.length) stderr += `  Missing: ${missing.join(', ')}\n`;
  if (found.length) stderr += `  Found instead: ${found.join(', ')}\n`;
  stderr +=
    `  Add "react" and "vitest" to your package.json dependencies, ` +
    `or point Testsmith at the right project root.\n`;
  return { code: 1, stdout: '', stderr };
}

/**
 * Orchestrates framework/runner detection for the `scan` command: read the
 * project, run the pure analyzer, and render the outcome. Returns streams +
 * exit code instead of touching process, so it is trivially unit-testable.
 */
export function runScan(dir: string, opts: ScanOptions): ScanOutput {
  const project = readProject(dir);

  if (!project.ok) {
    if (opts.json) {
      return { code: 1, stdout: JSON.stringify(project, null, 2) + '\n', stderr: '' };
    }
    const stderr =
      project.error === 'missing-package-json'
        ? `✗ No package.json found at ${project.path} — point Testsmith at your project root.\n`
        : `✗ Could not parse ${project.path} — it isn't valid JSON.\n`;
    return { code: 1, stdout: '', stderr };
  }

  const result = detectStack(project.pkg, project.signals);

  if (opts.json) {
    return {
      code: result.ok ? 0 : 1,
      stdout: JSON.stringify(result, null, 2) + '\n',
      stderr: '',
    };
  }

  return result.ok ? formatSuccess(result) : formatUnsupported(result.reasons);
}
