import { describe, it, expect } from 'vitest';
import { add } from './src/add.js';
import { sign } from './src/partial.js';

// Exercises add fully and sign only on its positive branch, leaving the negative
// and zero branches of partial.ts uncovered. untested.ts is never imported.
describe('math fixture', () => {
  it('adds', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('signs a positive', () => {
    expect(sign(5)).toBe('pos');
  });
});
