import { defineConfig } from 'vite';

// Vitest configured inside vite.config (no standalone vitest.config). The deps
// gate still passes because `vitest` is a devDependency.
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
