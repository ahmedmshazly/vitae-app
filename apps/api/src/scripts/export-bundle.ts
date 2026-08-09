/**
 * Privileged full-fidelity export (backup path). Writes the same ZIP shape as
 * POST /api/v1/export, always with sensitive records included.
 *
 *   pnpm --filter @vitae/api export:bundle -- --out=/tmp/vitae-export.zip
 *
 * Prefer this over curling a live session cookie. Uses Admin SDK credentials
 * from the API env (same as seed/restore).
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import '../env.js';
import { exportEntries } from '../services/export.js';
import { env } from '../env.js';
import { createZipArchive } from '../lib/create-zip-archive.js';

/** Host and database of the graph this bundle was read from, never credentials. */
function datasource(): string {
  try {
    const url = new URL(env.DATABASE_URL);
    return `postgres://${url.hostname}${url.pathname}`;
  } catch {
    return 'postgres';
  }
}

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

async function main(): Promise<void> {
  const outArg = argValue('--out') ?? process.env.EXPORT_OUT;
  if (!outArg) {
    console.error('usage: export:bundle -- --out=<path.zip>');
    process.exit(2);
  }
  const outPath = resolve(outArg);
  mkdirSync(dirname(outPath), { recursive: true });

  const includeSensitive = process.argv.includes('--share-safe')
    ? false
    : process.env.INCLUDE_SENSITIVE !== '0';

  console.log(`[export] source=${datasource()} include_sensitive=${includeSensitive} → ${outPath}`);

  const archive = createZipArchive({ zlib: { level: 9 } });
  const hash = createHash('sha256');
  const out = createWriteStream(outPath);
  archive.on('data', (chunk: Buffer) => hash.update(chunk));
  archive.on('error', (err: Error) => {
    throw err;
  });
  archive.pipe(out);

  const gen = exportEntries({ includeSensitive });
  let next = await gen.next();
  while (!next.done) {
    if (typeof next.value.content === 'string' || Buffer.isBuffer(next.value.content)) {
      archive.append(next.value.content, { name: next.value.name });
    } else {
      const stream = Readable.from(next.value.content);
      archive.append(stream, { name: next.value.name });
      await finished(stream);
    }
    next = await gen.next();
  }
  const manifest = next.value;
  await archive.finalize();
  await finished(out);

  const sha256 = hash.digest('hex');
  // Machine-readable summary for backup-to-s3.sh (one JSON object on stdout after logs).
  console.log(
    JSON.stringify({
      out: outPath,
      sha256,
      includes_sensitive: manifest.includes_sensitive,
      schema_version: manifest.schema_version,
      generated_at: manifest.generated_at,
      // Data-plane origin (Postgres), not FIREBASE_PROJECT_ID (Auth after ADR 0005).
      source: datasource(),
      // Alias of `source` for tooling that still reads `project_id`.
      project_id: datasource(),
      counts: manifest.counts,
    }),
  );
}

main().catch((err) => {
  console.error('[export] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
