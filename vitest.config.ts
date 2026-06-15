import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Fixture trees under tests/fixtures contain intentional *.test.* / *.spec.*
    // files used as enumeration inputs — they are data, not suites to run.
    exclude: [...configDefaults.exclude, 'tests/fixtures/**'],
  },
});
