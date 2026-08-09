import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Avoid coverage.all file discovery: the repo pins brace-expansion>=5 for
      // security, which breaks minimatch/glob used by test-exclude.
      all: false,
      reportsDirectory: '../../coverage/core',
      reporter: ['text', 'lcov', 'html', 'cobertura'],
      include: ['src/algorithms/**/*.ts', 'src/schema/**/*.ts', 'src/forms/**/*.ts', 'src/importers/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      // Intermediate ratchet after property/metamorphic/golden suites.
      // Program target remains 100% lines/functions and 98% branches.
      thresholds: {
        lines: 92,
        functions: 85,
        branches: 78,
        statements: 92,
      },
    },
  },
});
