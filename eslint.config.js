// Flat ESLint config for the Vitae monorepo.
// Enforces the module boundary (INT-2 / NFR-MNT-002): nothing outside
// packages/core may reach into another workspace's internals.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Local Vercel build output. Gitignored, but eslint does not read
      // .gitignore. Without this ignore, `pnpm lint` reports thousands of errors
      // from minified bundles on any machine that has run a build.
      '**/.vercel/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Design-system export artifacts: `.ds-sync` is the vendored converter
      // and `ds-bundle` is its generated upload tree (compiled bundles and
      // emitted .d.ts). Same reason as .vercel above: generated, gitignored,
      // and eslint does not read .gitignore.
      '**/.ds-sync/**',
      '**/ds-bundle/**',
      // Stryker mutates into a temp sandbox; lint must not scan instrumented copies.
      '**/.stryker-tmp/**',
      '**/reports/mutation/**',
      '**/*.config.js',
      '**/*.config.ts',
      // The Playwright config is not build tooling. It carries the clock the
      // suite agrees on, the timeouts, and the guard that refuses a focused
      // test, so it is exactly the file worth linting.
      '!e2e/playwright.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The React Compiler's own lint rules. The plugin was registered here but no
  // rule from it was ever enabled, so rules-of-hooks has never run on this
  // codebase. `recommended-latest` in v7 carries the compiler diagnostics too,
  // which is what keeps every component compilable as the code changes.
  reactHooks.configs.flat['recommended-latest'],
  {
    // Three of the compiler's diagnostics fire on code that predates it, so
    // they run as warnings rather than blocking every later branch on a sweep
    // of screens that are already scheduled for rework. As of this commit:
    //
    //   25  set-state-in-effect   across 22 files
    //    4  refs                  (a ref read during render)
    //    1  immutability          (tailor/Tailor.tsx)
    //
    // They are real: setState inside an effect is the cascading-render pattern
    // the audit found in 16 files that pair an effect with await. Each one gets
    // fixed with the screen that owns it, and the rule goes back to error once
    // its last site is gone. Do not add new ones; the count above only moves
    // down.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-console': 'off',
    },
  },
  {
    // Type-aware linting, scoped to the API (where the hazard lives) because it
    // is slow enough to confine.
    //
    // Repository `stage*` methods are async. An un-awaited call inside a
    // transaction is a write that can land after the transaction commits or
    // rolls back, and `tsc` allows floating promises. This rule catches them.
    files: ['apps/api/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // Its counterpart: awaiting something that was never a promise usually
      // means a call was refactored and its await left pointing at the wrong
      // expression.
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // The rules that keep the end-to-end suite honest used to be grep commands
    // in a hand-maintained test plan, run by hand or not at all. These are the
    // same ratchets, applied by the linter on the way in.
    ...playwright.configs['flat/recommended'],
    files: ['e2e/tests/**/*.ts', 'e2e/playwright.config.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // A focused or skipped test is how a green run stops meaning anything.
      // `forbidOnly` in the Playwright config catches the first when the gate
      // runs; catching both at review time is cheaper than catching them late.
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
      // page.pause() halts a headless run until the test times out.
      'playwright/no-page-pause': 'error',
      // Element handles read once. Locators retry, which is what a
      // client-rendered app needs; reading once reads too early.
      'playwright/no-element-handle': 'error',
      'playwright/valid-expect': 'error',
      // A test that asserts nothing passes for free. The rule cannot see this
      // repository's assertion helpers by itself, and without these names it
      // reported all ten a11y-only tests as empty.
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['expectNoA11yViolations', 'expectOkJson'] },
      ],
      // Reading with getAttribute() or innerText() takes one sample; the
      // toHave* form retries. Five sites still read once, listed in
      // docs/testing/e2e-review-2026-08-25.md. Converting them rewrites
      // existing assertions, which was out of scope for that review, so this
      // is a warning until someone takes that decision.
      'playwright/prefer-web-first-assertions': 'warn',
      // Both of the following have honest uses in this suite and stay warnings.
      // ask.spec.ts waits 500ms to prove a request was never sent, which no
      // assertion can express, and a few specs branch on what the shared graph
      // happens to hold. A new one still deserves a second look.
      'playwright/no-wait-for-timeout': 'warn',
      'playwright/no-conditional-in-test': 'warn',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
