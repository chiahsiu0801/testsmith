import { describe, it, expect } from 'vitest';
import { isCandidate, filterCandidates } from '../src/scan/candidates.js';
import type { CandidateConfig } from '../src/scan/types.js';

const config = (over: Partial<CandidateConfig> = {}): CandidateConfig => ({
  sourceRoot: 'src',
  ignore: [],
  ...over,
});

describe('isCandidate', () => {
  describe('keeps real source files', () => {
    it.each([
      'src/components/Button.tsx',
      'src/utils/math.ts',
      'src/index.js',
      'src/widgets/Widget.jsx',
      'src/latest.ts', // `test` is a substring, not the penultimate segment
      'src/respec.ts', // `spec` is a substring, not the penultimate segment
      'src/config.ts', // bare config.ts is app source, not a config file
      'src/setup.ts', // bare setup.ts is app source, not a setup file
    ])('keeps %s', (path) => {
      expect(isCandidate(path, config())).toBe(true);
    });
  });

  describe('excludes by extension', () => {
    it.each([
      'src/styles.css',
      'src/data.json',
      'src/script.mjs', // .mjs/.cjs are out of the candidate set
      'src/script.cjs',
      'src/types/api.d.ts', // declaration file, despite ending in .ts
    ])('drops %s', (path) => {
      expect(isCandidate(path, config())).toBe(false);
    });
  });

  describe('excludes test files', () => {
    it.each([
      'src/components/Button.test.tsx',
      'src/utils/math.spec.ts',
      'src/components/__tests__/Legacy.tsx',
      'src/__tests__/helpers.ts',
    ])('drops %s', (path) => {
      expect(isCandidate(path, config())).toBe(false);
    });
  });

  describe('excludes config / setup files', () => {
    it.each([
      'src/vite.config.ts',
      'src/vitest.config.ts',
      'src/tailwind.config.js',
      'src/test.setup.ts',
      'src/setupTests.ts',
      'src/setupTests.js',
      'src/.eslintrc.js', // leading-dot config file
    ])('drops %s', (path) => {
      expect(isCandidate(path, config())).toBe(false);
    });
  });

  describe('excludes generated / vendored / dot directories', () => {
    it.each([
      'src/__generated__/types.ts',
      'src/dist/bundle.js',
      'src/.cache/x.ts', // dot-directory
      'src/.next/page.js',
      'node_modules/react/index.js', // outside src AND a vendored segment
      'src/vendor/node_modules/dep.js', // nested node_modules
    ])('drops %s', (path) => {
      expect(isCandidate(path, config())).toBe(false);
    });
  });

  describe('source-root scoping', () => {
    it('drops files outside the source root', () => {
      expect(isCandidate('lib/helper.ts', config())).toBe(false);
      expect(isCandidate('scripts/build.ts', config())).toBe(false);
    });

    it('honors a custom source root', () => {
      expect(isCandidate('app/main.ts', config({ sourceRoot: 'app' }))).toBe(true);
      expect(isCandidate('src/main.ts', config({ sourceRoot: 'app' }))).toBe(false);
    });

    it('treats "." as the whole project (no prefix required)', () => {
      expect(isCandidate('main.ts', config({ sourceRoot: '.' }))).toBe(true);
    });
  });

  describe('user ignore globs (additive)', () => {
    it('drops files matched by an ignore glob', () => {
      const cfg = config({ ignore: ['**/*.stories.tsx', 'src/generated/**'] });
      expect(isCandidate('src/Button.stories.tsx', cfg)).toBe(false);
      expect(isCandidate('src/generated/schema.ts', cfg)).toBe(false);
    });

    it('does not affect files the globs do not match', () => {
      const cfg = config({ ignore: ['**/*.stories.tsx'] });
      expect(isCandidate('src/Button.tsx', cfg)).toBe(true);
    });
  });
});

describe('filterCandidates', () => {
  it('keeps only the scanned set, preserving input order', () => {
    const input = [
      'src/Button.tsx',
      'src/Button.test.tsx',
      'src/types.d.ts',
      'src/utils.ts',
      'src/vite.config.ts',
    ];
    expect(filterCandidates(input, config())).toEqual(['src/Button.tsx', 'src/utils.ts']);
  });
});
