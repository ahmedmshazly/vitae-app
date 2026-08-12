/// <reference types="vitest/config" />
// Vite's own defineConfig, augmented by the reference above to accept `test`.
// Importing defineConfig from 'vitest/config' instead would drag in Vitest's
// bundled Vite 5 types and clash with the Vite 6 this app builds on.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ENV_DIRECTORY = '../../';

function assertHostedConfiguration(env: Record<string, string>): void {
  const invalid: string[] = [];
  if (!env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY === 'demo-api-key') {
    invalid.push('VITE_FIREBASE_API_KEY');
  }
  if (
    !env.VITE_FIREBASE_AUTH_DOMAIN ||
    env.VITE_FIREBASE_AUTH_DOMAIN === 'vitae-local.firebaseapp.com'
  ) {
    invalid.push('VITE_FIREBASE_AUTH_DOMAIN');
  }
  if (!env.VITE_FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID === 'vitae-local') {
    invalid.push('VITE_FIREBASE_PROJECT_ID');
  }
  if (env.VITE_FIREBASE_USE_EMULATOR !== 'false') {
    invalid.push('VITE_FIREBASE_USE_EMULATOR');
  }
  if (
    !env.VITE_API_BASE_URL ||
    /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(env.VITE_API_BASE_URL)
  ) {
    invalid.push('VITE_API_BASE_URL');
  }
  if (invalid.length) {
    throw new Error(
      `Refusing hosted web build with missing or local-only configuration: ${invalid.join(', ')}`,
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIRECTORY, '');
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    assertHostedConfiguration(env);
  }

  return {
    plugins: [
      // The React Compiler memoises for us. The app hand-wrote 118 useMemo and
      // 56 useCallback calls to do the same job; those stay correct and are now
      // mostly redundant, so they can come out screen by screen rather than in
      // one sweep. eslint-plugin-react-hooks v7 carries the compiler's own lint
      // rules, so anything it cannot safely compile is reported rather than
      // silently skipped.
      react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } }),
      tailwindcss(),
    ],
    // The monorepo keeps a single .env at the repo root (see .env.example); without
    // this Vite would look only in apps/web and every VITE_* var would be undefined.
    envDir: ENV_DIRECTORY,
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      target: 'es2022',
    },
    optimizeDeps: {
      include: ['maplibre-gl'],
      esbuildOptions: {
        target: 'es2022',
      },
    },
    // Allow importing TS source directly from workspace packages (@vitae/*).
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Component tests exercise focus management, portals, and async form
      // validation. Ten seconds keeps the suite reliable under CI contention
      // without weakening application-level interaction timeouts.
      testTimeout: 10_000,
      coverage: {
        provider: 'v8',
        all: false,
        reportsDirectory: '../../coverage/web',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      },
    },
  };
});
