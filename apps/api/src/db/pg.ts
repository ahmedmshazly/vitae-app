/**
 * The Postgres connection (ADR 0005).
 *
 * One pool per process, one Kysely instance over it. Nothing outside `db/`
 * should import this, services go through `repository`, which is the seam the
 * layering rule names (route → service → repository).
 */
import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { env } from '../env.js';
import type { Database } from './schema.js';

/**
 * `numeric` arrives as a string by default so 64-bit values survive the trip.
 * Nothing here stores numerics: `rev` is an integer and `confidence` lives
 * inside jsonb, but a future column would otherwise silently become a string.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
// int8/bigint: count(*) returns int8, and we want a number, not a string.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

function sslFor(url: string): ConnectionOptions | false {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (host === 'localhost' || host === '127.0.0.1' || host === 'postgres') return false;
  // RDS presents a certificate signed by an Amazon CA that is not in Node's
  // default trust store, so verification needs the bundle supplied explicitly.
  // Failing loudly beats `rejectUnauthorized: false`, which would accept any
  // certificate and quietly make the connection interceptable.
  if (!env.DATABASE_CA_CERT) {
    throw new Error(
      `DATABASE_URL points at a remote host (${host}) but DATABASE_CA_CERT is unset. ` +
        'Supply the RDS CA bundle so TLS can actually be verified, see docs/runbooks/postgres-restore.md.',
    );
  }
  // Accept either the PEM itself or a path to it. A CA bundle is multi-line and
  // an env file is not, so on a real host the path form is the only practical
  // one; the inline form stays supported for secret managers that inject the
  // whole value.
  const ca = env.DATABASE_CA_CERT.trimStart().startsWith('-----BEGIN')
    ? env.DATABASE_CA_CERT
    : readFileSync(env.DATABASE_CA_CERT, 'utf8');
  return { ca, rejectUnauthorized: true };
}

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: sslFor(env.DATABASE_URL),
  // A query that hangs holds a connection out of a pool this small; fail it.
  statement_timeout: 30_000,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// An idle-client error (RDS failover, network blip) is emitted on the pool, not
// on any request. Unhandled, it takes the process down.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

/** Cheap liveness probe for the readiness endpoint. */
export async function ping(): Promise<void> {
  await sql`SELECT 1`.execute(db);
}

/** Close the pool on shutdown so in-flight queries finish first. */
export async function closeDb(): Promise<void> {
  await db.destroy();
}
