/**
 * Stage an Aperture vitae.graph.bundle, force-skip every person (and identity)
 * duplicate, then commit. Matches the import plan: never create similar people.
 *
 *   pnpm --filter @vitae/api exec tsx src/scripts/commit-aperture-bundle.ts \
 *     --file=../../snapshots/aperture-run-export/vitae.graph.bundle.json \
 *     --space=real
 *
 *   --dry-run   stage + apply skip policy, print report, do not commit
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../env.js';
import { closeDb } from '../db/pg.js';
import { runInSpace, type Space } from '../db/space.js';
import { commitImport, getBatch, setRowDecision, stageImport } from '../services/imports.js';

function arg(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const file = arg('--file');
  if (!file) {
    console.error('Usage: commit-aperture-bundle.ts --file=<bundle.json> [--space=real|demo] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const space = (arg('--space') ?? 'real') as Space;
  if (space !== 'real' && space !== 'demo') {
    console.error('--space must be real or demo');
    process.exitCode = 1;
    return;
  }
  const dryRun = hasFlag('--dry-run');
  const abs = resolve(file);
  const content = readFileSync(abs, 'utf8');
  const filename = abs.split('/').pop() ?? 'vitae.graph.bundle.json';

  await runInSpace(space, async () => {
    console.log(`[commit-aperture] staging ${filename} into space=${space} (${content.length} chars)`);
    const { batch, rows } = await stageImport('aperture', filename, content);
    console.log(
      `[commit-aperture] staged batch=${batch.id} rows=${rows.length} ` +
        `accepted=${batch.stats.accepted} dupCandidates=${batch.stats.dupCandidates}`,
    );

    let forcedSkip = 0;
    for (const row of rows) {
      const isPerson =
        row.entity === 'person' ||
        (row.entity === 'graph_node' && (row.node_type === 'person' || row.payload?.type === 'person'));
      if (!row.dup) continue;
      // Force-skip every person dup (possible + probable). Also skip any other
      // entity with a probable identity hit so we don't fork orgs/roles that
      // already exist under the same external key.
      const shouldSkip =
        isPerson || row.dup.verdict === 'probable' || row.decision === 'skip';
      if (!shouldSkip) continue;
      if (row.decision === 'skip') continue;
      await setRowDecision(batch.id, row.id, 'skip');
      forcedSkip += 1;
    }

    const after = await getBatch(batch.id);
    if (!after) throw new Error(`batch ${batch.id} disappeared after staging`);
    const accept = after.rows.filter((r) => r.decision === 'accept').length;
    const skip = after.rows.filter((r) => r.decision === 'skip').length;
    const personAccept = after.rows.filter(
      (r) =>
        r.decision === 'accept' &&
        (r.entity === 'person' ||
          (r.entity === 'graph_node' && (r.node_type === 'person' || r.payload?.type === 'person'))),
    ).length;
    const personSkip = after.rows.filter(
      (r) =>
        r.decision === 'skip' &&
        (r.entity === 'person' ||
          (r.entity === 'graph_node' && (r.node_type === 'person' || r.payload?.type === 'person'))),
    ).length;

    console.log(
      `[commit-aperture] after policy: accept=${accept} skip=${skip} ` +
        `forcedSkip=${forcedSkip} personAccept=${personAccept} personSkip=${personSkip}`,
    );
    for (const row of after.rows
      .filter((r) => r.dup && (r.node_type === 'person' || r.payload?.type === 'person'))
      .slice(0, 15)) {
      console.log(
        `  person-dup ${row.decision} → ${row.dup?.nodeTitle} (${row.dup?.verdict}) :: ${row.title}`,
      );
    }

    if (dryRun) {
      console.log('[commit-aperture] dry-run, not committing. Batch left staged:', batch.id);
      return;
    }

    const result = await commitImport(batch.id);
    console.log(
      `[commit-aperture] committed batch=${batch.id} created=${result.created} failed=${result.failed}`,
    );
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
