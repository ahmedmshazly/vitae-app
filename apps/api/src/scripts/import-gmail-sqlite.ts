import '../env.js';
import { closeDb } from '../db/pg.js';
import { importGmailSqlite } from '../services/gmail-sqlite.js';

const args = process.argv.slice(2);
const path = args.find((arg) => !arg.startsWith('--'));
const selfArg = args.find((arg) => arg.startsWith('--self='))?.slice('--self='.length);
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
if (!path || !selfArg) {
  console.error(
    'usage: pnpm --filter @vitae/api import:gmail -- /absolute/mail.sqlite --self=me@example.com[,alias@example.com] [--limit=500]',
  );
  process.exitCode = 2;
} else {
  await importGmailSqlite({
    path,
    selfAddresses: selfArg
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    limit: limitArg ? Number(limitArg) : undefined,
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
await closeDb();
