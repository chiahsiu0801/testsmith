import { defineConfig } from 'vitest/config';

// Self-rooting config so a nested `vitest run` here does NOT inherit the repo's
// top-level config (which excludes tests/fixtures/**). Coverage reporter, `all`,
// reportsDirectory, and include are all forced on the CLI by the tool's runner, so
// this stays intentionally empty.
export default defineConfig({});
