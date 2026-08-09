/**
 * Print the graph-derived résumé model. A verification aid, not a product
 * surface: the résumé is single-subject and ownership-scoped, so its section
 * counts are the sharpest check that a migration moved the right records.
 */
import '../env.js';
import { closeDb } from '../db/pg.js';
import { repository } from '../db/repository.js';
import { buildFullModel } from '../services/resume-model.js';

type Section = {
  key: string;
  entries?: Array<{ title?: string; org?: string }>;
  skillRows?: unknown[];
  lines?: unknown[];
};

const counts = await repository.liveCounts();
console.log(`  graph: ${counts.nodes} nodes, ${counts.edges} edges`);

const model = (await buildFullModel([], { headline: 'probe' })) as unknown as Record<string, unknown>;
console.log(`  owner: ${String(model.name)}`);
for (const s of model.sections as Section[]) {
  const n = s.entries?.length ?? s.skillRows?.length ?? s.lines?.length ?? 0;
  console.log(`  ${s.key.padEnd(11)} ${String(n).padStart(3)}`);
}
await closeDb();
