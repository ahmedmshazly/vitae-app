/**
 * Centralised, Zod-validated environment configuration for the Vitae API.
 *
 * Fail-fast: the process refuses to start if a required variable is missing or
 * malformed, so misconfiguration surfaces at boot rather than at request time
 * (SRS §7.5 maintainability; T7 secret discipline, names documented in
 * `.env.example`, values only in the git-ignored `.env`).
 */
import { z } from 'zod';

const boolish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated browser origins allowed by CORS (primary web + aliases).
  WEB_ORIGIN: z
    .string()
    .min(1)
    .default('http://localhost:5173')
    .superRefine((value, ctx) => {
      for (const part of value.split(',')) {
        const origin = part.trim();
        if (!origin) continue;
        if (!z.string().url().safeParse(origin).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid origin in WEB_ORIGIN: ${origin}`,
          });
        }
      }
    }),

  // Auth (SRS INT-1 / FR-SET-001)
  OWNER_EMAIL: z.string().email(),
  AUTH_ENABLE_DEV_LOGIN: boolish.default('false'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),

  /**
   * A second Firebase project whose ID tokens are also accepted: the companion
   * app (Aperture) signs in the same human against its own project, and a
   * Firebase token is scoped to the project that issued it.
   *
   * This widens which identity provider can prove "I am the owner"; it does not
   * widen *who* the owner is. The OWNER_EMAIL check still gates every request,
   * and the cross-project path additionally demands a verified email from a
   * Google sign-in. Unset = the feature is off.
   */
  TRUSTED_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  /** Browser origin allowed to call this API in addition to WEB_ORIGIN. */
  APERTURE_ORIGIN: z.string().url().optional(),

  /**
   * Where the compiled documentation corpus lives on disk.
   *
   * The corpus is served by this API rather than by the public web host,
   * because it is private: it describes the whole system, and its generated
   * half enumerates every route, endpoint, table and exported symbol in the
   * repository. Behind this API it inherits the OWNER_EMAIL allow-list that
   * gates every other request, which is the only reason it is readable at all.
   *
   * Unset means no corpus was built into this deployment, and the endpoints
   * report that rather than pretending the documentation is empty.
   */
  DOCS_CONTENT_DIR: z.string().min(1).optional(),

  // Firebase: AUTH ONLY (ADR 0005). Sign-in stayed on Firebase when the data
  // plane moved to Postgres, because `verifyIdToken` is free, unmetered, and was
  // never the constraint. There is no Firestore here any more.
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),

  // Postgres, the data plane (ADR 0005). The default points at the local
  // compose service; production supplies the RDS endpoint and is refused at
  // boot if it is still carrying this default (see assertSafeCombination).
  DATABASE_URL: z.string().url().default('postgresql://vitae:vitae@127.0.0.1:5433/vitae'),
  /** Single-user workload; a large pool would only hold RDS connections idle. */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /**
   * PEM bundle for verifying the database's TLS certificate. Required whenever
   * DATABASE_URL is not localhost: RDS certificates are signed by an Amazon CA
   * that Node does not trust by default, and the alternative to supplying it is
   * `rejectUnauthorized: false`, which accepts any certificate at all.
   */
  DATABASE_CA_CERT: z.string().min(1).optional(),

  // Storage: Cloudinary (SRS T5)
  CLOUDINARY_URL: z.string().startsWith('cloudinary://').optional(),
  CLOUDINARY_FOLDER: z.string().default('vitae'),

  // LaTeX build service (SRS §8.4)
  BUILDSVC_URL: z.string().url().default('http://localhost:8787'),
  BUILDSVC_HMAC_SECRET: z.string().min(8).default('dev-buildsvc-secret'),

  // Third-party credentials come from the deployment's secret manager, never
  // from application data (FR-004). Optional: the file-backed secret store in
  // `.secrets/` backs local/self-hosted installs.
  GITHUB_PAT: z.string().optional(),
  VITAE_SECRETS_DIR: z.string().optional(),
});

/**
 * Secrets that ship in the repo as development defaults. They are public, so a
 * production process that still carries one is unauthenticated in practice
 * (FR-027).
 */
const KNOWN_DEV_SECRETS = new Set([
  'dev-buildsvc-secret',
  'dev-only-buildsvc-hmac-secret-please-rotate-3d8e5f',
  'change-me-to-a-shared-secret',
]);

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  /** True when Firebase Auth is pointed at the local emulator. */
  usingEmulators: boolean;
};

let cached: ServerEnv | null = null;

/**
 * Combinations that are individually valid but unsafe together. Fail at boot:
 * a misconfigured production process must not come up and start serving
 * (FR-015: dev login hands any caller a valid owner token; FR-027: a published
 * default HMAC secret lets a network-adjacent caller sign build requests).
 */
function assertSafeCombination(env: z.infer<typeof serverEnvSchema>): void {
  if (env.NODE_ENV !== 'production') return;
  const fatal: string[] = [];
  if (env.AUTH_ENABLE_DEV_LOGIN) {
    fatal.push(
      'AUTH_ENABLE_DEV_LOGIN=true with NODE_ENV=production: developer sign-in issues an owner token to any ' +
        'unauthenticated caller. Unset it, or run with NODE_ENV=development.',
    );
  }
  if (KNOWN_DEV_SECRETS.has(env.BUILDSVC_HMAC_SECRET)) {
    fatal.push('BUILDSVC_HMAC_SECRET is the published development default; generate a unique secret for production.');
  }
  if (env.SESSION_SECRET.startsWith('dev-') || env.SESSION_SECRET === 'change-me') {
    fatal.push('SESSION_SECRET looks like a development placeholder; generate a unique secret for production.');
  }
  // A production API that silently fell back to the local default would come up
  // healthy against an empty database and start accepting writes into it.
  if (/(127\.0\.0\.1|localhost)/.test(env.DATABASE_URL)) {
    fatal.push(
      'DATABASE_URL points at localhost in production; set it to the RDS endpoint. ' +
        'Booting with the development default would serve an empty graph.',
    );
  }
  if (fatal.length) {
    throw new Error(`Unsafe production configuration:\n${fatal.map((f) => `  • ${f}`).join('\n')}`);
  }
}

/** Parse and cache the server environment. Throws a readable error on failure. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertSafeCombination(parsed.data);
  cached = {
    ...parsed.data,
    // Only Auth has an emulator now. The data plane is a real Postgres, local
    // or remote, so there is nothing else left to emulate (ADR 0005).
    usingEmulators: Boolean(parsed.data.FIREBASE_AUTH_EMULATOR_HOST),
  };
  return cached;
}

/** Test helper: clear the memoised env so a fresh parse runs next call. */
export function resetServerEnvCache(): void {
  cached = null;
}
