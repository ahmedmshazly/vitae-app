/**
 * Load a graph bundle into the database (ADR 0005, Phase 3).
 *
 *   pnpm --filter @vitae/api load:bundle -- --file=fixtures/vitae-bundle.golden.json
 *   pnpm --filter @vitae/api load:bundle -- --file=... --space=demo --dry-run
 *
 * Ids are derived from stable bundle references.
 * `externalNodeId(identity_keys[0] ?? "vitae:seed:<ref>")` for nodes and
 * `bundleEdgeId(type, srcId, dstId)` for edges, so a record loaded here lands
 * on a stable database id. That makes a later production export mergeable
 * rather than a source of duplicates.
 *
 * `createNode` returns an existing record untouched when the id is already
 * present, so re-running this is a no-op rather than a second copy.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { externalNodeId, parseGraphBundle } from '@vitae/core';
import '../env.js';
import { closeDb } from '../db/pg.js';
import { repository } from '../db/repository.js';
import { runInSpace, type Space } from '../db/space.js';

const ACTOR = 'load-bundle';
const SEED_KEY_PREFIX = 'vitae:seed:';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const seedKey = (ref: string): string => `${SEED_KEY_PREFIX}${ref}`;
const bundleEdgeId = (type: string, src: string, dst: string): string =>
  `ext-edge-${sha256(`${type}\0${src}\0${dst}`).slice(0, 40)}`;

function arg(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

async function load(file: string, dryRun: boolean): Promise<void> {
  const parsed = parseGraphBundle(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.ok) {
    console.error(`[load-bundle] ${file} is not a valid bundle:`);
    for (const e of parsed.errors.slice(0, 20)) console.error(`  • ${e.path}: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const bundle = parsed.value;
  console.log(
    `[load-bundle] ${bundle.nodes.length} nodes, ${bundle.edges.length} edges ` +
      `from ${bundle.source.system}${bundle.source.run_id ? ` (${bundle.source.run_id})` : ''}` +
      `${dryRun ? ' : DRY RUN' : ''}`,
  );

  // ── nodes ────────────────────────────────────────────────────────────────
  const idOf = new Map<string, string>();
  let created = 0;
  let existed = 0;

  for (const bn of bundle.nodes) {
    const primary = bn.identity_keys[0] ?? seedKey(bn.ref);
    const id = externalNodeId(primary, sha256);
    idOf.set(bn.ref, id);
    if (dryRun) continue;

    const { ref: _ref, ...create } = bn;
    const before = await repository.getNode(id, { includeDeleted: true });
    const node = await repository.createNode(create, { actor: ACTOR, source: bn.source }, { id });
    if (before) existed += 1;
    else created += 1;
    // A soft-deleted record must come back live, or its edges stay hidden.
    if (node.deleted_at) await repository.restoreNode(node.id, { actor: ACTOR });
  }

  // ── edges ────────────────────────────────────────────────────────────────
  let edgesCreated = 0;
  let edgesExisted = 0;
  const failures: string[] = [];

  for (const be of bundle.edges) {
    const src = idOf.get(be.src);
    const dst = idOf.get(be.dst);
    if (!src || !dst) {
      // parseGraphBundle already rejects unresolvable refs, so this is defence
      // against a future schema change rather than an expected branch.
      failures.push(`${be.type} ${be.src}→${be.dst}: endpoint not in bundle`);
      continue;
    }
    const id = bundleEdgeId(be.type, src, dst);
    if (dryRun) continue;

    try {
      const before = await repository.getEdge(id, { includeDeleted: true });
      await repository.createEdge({ ...be, src, dst }, { actor: ACTOR, source: be.source }, { id });
      if (before) edgesExisted += 1;
      else edgesCreated += 1;
    } catch (error) {
      failures.push(`${be.type} ${be.src}→${be.dst}: ${(error as Error).message}`);
    }
  }

  console.log(
    dryRun
      ? `[load-bundle] would create up to ${bundle.nodes.length} nodes and ${bundle.edges.length} edges`
      : `[load-bundle] nodes: ${created} created, ${existed} already present\n` +
        `[load-bundle] edges: ${edgesCreated} created, ${edgesExisted} already present`,
  );

  if (failures.length) {
    console.error(`[load-bundle] ${failures.length} edge(s) failed:`);
    for (const f of failures.slice(0, 20)) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
  }

  if (!dryRun) {
    const counts = await repository.liveCounts();
    console.log(`[load-bundle] live totals: ${counts.nodes} nodes, ${counts.edges} edges`);

    // The résumé is single-subject and reads nothing without this anchor, so a
    // load that leaves it unset produces an empty CV rather than an error.
    const self = (await repository.listNodes({ type: 'person', limit: 500 })).find(
      (n) => (n.props as { is_self?: boolean }).is_self,
    );
    console.log(
      self
        ? `[load-bundle] is_self anchor: ${self.title} (${self.id})`
        : '[load-bundle] WARNING: no person has props.is_self, the résumé will render empty',
    );
  }
}

const file = arg('--file');
if (!file) {
  console.error('usage: load:bundle -- --file=<bundle.json> [--space=demo] [--dry-run]');
  process.exit(2);
}
const space = (arg('--space') ?? 'real') as Space;
await runInSpace(space, () => load(resolve(file), process.argv.includes('--dry-run'))).finally(closeDb);
