#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'node:path';
import { runScan } from './runScan.js';

const program = new Command();

program
  .name('testsmith')
  .description('Rank source files by test-risk and generate Vitest+RTL tests')
  .version('0.1.0');

program
  .command('scan')
  .description('Detect the framework/runner and (later) print a ranked file inventory')
  .argument('[path]', 'project root to analyze', '.')
  .option('--json', 'emit the detection result as JSON')
  .action((path: string, opts: { json?: boolean }) => {
    const { code, stdout, stderr } = runScan(resolve(path), { json: opts.json });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.exitCode = code;
  });

program.parse();
