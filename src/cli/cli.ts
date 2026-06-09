#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program.name('testsmith').description('Rank source files by test-risk and generate Vitest+RTL tests').version('0.1.0');

program
  .command('scan')
  .description('Analyze the project and print a ranked file inventory')
  .action(() => {
    console.log('scan: not yet implemented');
  });

program.parse();
