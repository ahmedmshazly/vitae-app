/**
 * Attach an owner to records that never got one.
 *
 * Before subjects were explicit, a role/education/certification/award/course/
 * repository/talk created in the UI got no owning edge at all. Any query that
 * walks subject edges silently misses those records, so they belong to nobody
 * and appear nowhere.
 *
 *   pnpm --filter @vitae/api backfill:subjects              # dry run (default)
 *   pnpm --filter @vitae/api backfill:subjects --apply      # → "Unattributed"
 *   pnpm --filter @vitae/api backfill:subjects --to-self --apply
 *
 * By default the gaps go to the reserved **anonymous** "Unattributed" person,
 * not to me. An ownerless record is a record whose owner is unknown, and
 * guessing that unknown means "mine" is exactly what put other people's degrees
 * on my résumé. Attributing them to a placeholder keeps them visible and
 * reassignable while stating plainly that nobody has claimed them.
 *
 * `--to-self` claims them for the `is_self` person, right only when you know
 * the graph holds a single person's records.
 *
 * Written edges carry source_ref `backfill-subject-v1` (or
 * `…-placeholder`), so undoing the whole operation is one query, see `--undo`.
 *
 * Records that already have a subject edge are left alone, including ones owned
 * by someone else: this only fills gaps, it never reassigns.
 */
import '../env.js';
import { NODE_FORM_DESCRIPTORS, NODE_TYPES, type NodeType } from '@vitae/core';
import { repository } from '../db/repository.js';
import { getSelf } from '../services/self.js';
import { ensurePlaceholder, getPlaceholder } from '../services/subjects.js';

const SOURCE_REF = 'backfill-subject-v1';
const PLACEHOLDER_SOURCE_REF = `${SOURCE_REF}-placeholder`;

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
/**
 * Claim ownerless records as the graph owner's.
 *
 * Off by default: imports bring in other people's profiles, and guessing "mine"
 * is how foreign degrees reached the résumé. Pass --to-self to claim explicitly.
 */
const toSelf = process.argv.includes('--to-self');
const toPlaceholder = !toSelf;

/** Node types that declare a subject, paired with the edge that expresses it. */
function subjectBearingTypes(): Array<{ type: NodeType; subject: NonNullable<(typeof NODE_FORM_DESCRIPTORS)[NodeType]['subject']> }> {
  return (NODE_TYPES as readonly NodeType[])
    .map((type) => ({ type, subject: NODE_FORM_DESCRIPTORS[type].subject }))
    .filter((x): x is { type: NodeType; subject: NonNullable<typeof x.subject> } => Boolean(x.subject));
}

async function runUndo(): Promise<void> {
  // Both variants, or --to-placeholder writes would be unremovable: they carry
  // a distinct source_ref so the two backfills can be told apart afterwards.
  const refs = new Set([SOURCE_REF, PLACEHOLDER_SOURCE_REF]);
  const live = (await repository.allLiveEdges()).filter((e) => refs.has(String(e.source_ref)));
  console.log(`${live.length} backfilled edge(s) to remove`);
  if (!apply) {
    console.log('\ndry run, pass --apply --undo to soft-delete them');
    return;
  }
  for (const doc of live) {
    await repository.softDeleteEdge(doc.id, { actor: 'backfill-subjects' });
  }
  console.log(`removed ${live.length} edge(s)`);
}

async function main(): Promise<void> {
  if (undo) return runUndo();

  // --to-placeholder needs no self anchor: the whole point is that these records
  // belong to nobody in particular.
  const owner = toPlaceholder ? (apply ? await ensurePlaceholder({ actor: 'backfill-subjects' }) : await getPlaceholder()) : await getSelf();
  if (!owner && !toPlaceholder) {
    // Refusing beats guessing: with no self node there is no defensible owner,
    // and a wrong owner is harder to notice than a missing one.
    console.error('No person node has props.is_self === true, nothing to attribute records to.');
    process.exitCode = 1;
    return;
  }
  console.log(
    toPlaceholder
      ? `owner: ${owner ? `${owner.title} (${owner.id})` : 'Unattributed (will be created on --apply)'}\n`
      : `self: ${owner!.title} (${owner!.id})\n`,
  );

  // One read of the edge table beats one query per candidate node.
  const liveEdges = await repository.allLiveEdges();

  let totalOrphans = 0;
  let written = 0;

  for (const { type, subject } of subjectBearingTypes()) {
    const nodes = await repository.listNodes({ type, limit: 10_000, includeArchived: true });
    // 'in' → the edge runs person → node, so the node is the dst.
    const attached = new Set(
      liveEdges
        .filter((e) => e.type === subject.edgeType)
        .map((e) => (subject.direction === 'in' ? e.dst : e.src)),
    );
    const orphans = nodes.filter((n) => !attached.has(n.id));
    if (orphans.length === 0) continue;

    totalOrphans += orphans.length;
    console.log(`${type}: ${orphans.length} of ${nodes.length} have no ${subject.edgeType} edge`);
    for (const node of orphans) console.log(`    ${node.title}`);

    if (!apply) continue;
    for (const node of orphans) {
      const [src, dst] = subject.direction === 'in' ? [owner!.id, node.id] : [node.id, owner!.id];
      await repository.createEdge(
        {
          type: subject.edgeType,
          src,
          dst,
          source: 'system',
          source_ref: toPlaceholder ? PLACEHOLDER_SOURCE_REF : SOURCE_REF,
          // Inferred from "it existed before owners were explicit", not observed.
          confidence: 0.8,
        },
        { actor: 'backfill-subjects' },
      );
      written += 1;
    }
  }

  if (totalOrphans === 0) {
    console.log('Every subject-bearing record already has an owner. Nothing to do.');
    return;
  }
  console.log(
    apply
      ? `\nwrote ${written} edge(s), undo with: pnpm --filter @vitae/api backfill:subjects --undo --apply`
      : `\ndry run: ${totalOrphans} edge(s) would be created. Re-run with --apply to write.`,
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
