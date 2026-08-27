import { defineConfig } from 'vitest/config';

const TEST_DB_URL =
  process.env.VITAE_TEST_DATABASE_URL ?? 'postgresql://vitae:vitae@127.0.0.1:5433/vitae_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
    // Suites truncate between tests, so they must never run against the database
    // a developer has seeded, doing so silently destroys local data. globalSetup
    // creates and migrates `vitae_test`; this points every suite at it regardless
    // of what `.env` says. NODE_ENV is pinned too: a parent shell that sourced
    // `.env` leaves NODE_ENV=development, Vitest will not override it, and the
    // storage singleton would then call Cloudinary instead of MemoryStorage.
    env: { DATABASE_URL: TEST_DB_URL, NODE_ENV: 'test' },
    globalSetup: ['./vitest.global-setup.ts'],
    // Truncation is global to the database, so two files running at once would
    // clear each other's fixtures mid-test.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      all: false,
      reportsDirectory: '../../coverage/api',
      reporter: ['text', 'lcov', 'html', 'cobertura'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/scripts/**'],
    },
  },
});
