/**
 * Read-only integrity audit of the live graph.
 *
 *   pnpm --filter @vitae/api audit:graph
 *   VITAE_SPACE=demo pnpm --filter @vitae/api audit:graph
 *
 * Integrity in this codebase is enforced at the edges of the system.
 * `assertEdgeEndpoints` on create, `graphBundleSchema` on import, `requireRef`
 * on restore, but nothing ever re-checks the graph as a whole. A record that
 * was soft-deleted while edges still pointed at it, or a node that lost its last
 * relationship, stays that way silently because every read model just skips it.
 * This walks the whole graph and reports.
 *
 * Writes nothing, ever. Exit code 1 when problems are found so it can gate a
 * migration or a deploy.
 */
import '../env.js';
import { edgeEndpointsAllowed, type EdgeType } from '@vitae/core';
import { repository } from '../db/repository.js';
import { currentSpace } from '../db/space.js';
import { buildOwnerIndex } from '../services/subjects.js';

interface Finding {
  severity: 'error' | 'warn';
  check: string;
  detail: string;
}

const findings: Finding[] = [];
const add = (severity: Finding['severity'], check: string, detail: string): void => {
  findings.push({ severity, check, detail });
};

async function main(): Promise<void> {
  const [nodes, edges, trash] = await Promise.all([
    repository.allLiveNodes(),
    repository.allLiveEdges(),
    repository.trash(),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const deletedIds = new Set(trash.map((n) => n.id));

  console.log(`space: ${currentSpace()}`);
  console.log(`live:  ${nodes.length} nodes, ${edges.length} edges (${trash.length} in trash)\n`);

  const byType = new Map<string, number>();
  for (const n of nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
  console.log('nodes by type');
  for (const [t, c] of [...byType.entries()].sort()) console.log(`  ${t.padEnd(16)} ${c}`);

  const eByType = new Map<string, number>();
  for (const e of edges) eByType.set(e.type, (eByType.get(e.type) ?? 0) + 1);
  console.log('\nedges by type');
  for (const [t, c] of [...eByType.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${t.padEnd(14)} ${c}`);
  }

  // ── dangling edges ────────────────────────────────────────────────────────
  for (const e of edges) {
    for (const end of ['src', 'dst'] as const) {
      const id = e[end];
      if (byId.has(id)) continue;
      const why = deletedIds.has(id) ? 'soft-deleted' : 'missing';
      add('error', 'dangling-edge', `${e.type} ${e.src} -> ${e.dst}: ${end} node ${id} is ${why}`);
    }
  }

  // ── endpoint type matrix ──────────────────────────────────────────────────
  for (const e of edges) {
    const s = byId.get(e.src);
    const d = byId.get(e.dst);
    if (!s || !d) continue;
    const allowed = edgeEndpointsAllowed(e.type as EdgeType, s.type, d.type);
    if (!allowed.ok) {
      add('error', 'endpoint-matrix', `${e.type}: ${s.type} -> ${d.type} (${e.id}): ${allowed.message}`);
    }
  }

  // ── duplicate relationships ───────────────────────────────────────────────
  const edgeKeys = new Map<string, string[]>();
  for (const e of edges) {
    const k = `${e.type}|${e.src}|${e.dst}`;
    edgeKeys.set(k, [...(edgeKeys.get(k) ?? []), e.id]);
  }
  for (const [k, ids] of edgeKeys) {
    if (ids.length > 1) add('error', 'duplicate-edge', `${ids.length}x ${k} (${ids.join(', ')})`);
  }

  // ── self-loops ────────────────────────────────────────────────────────────
  for (const e of edges) {
    if (e.src === e.dst) add('error', 'self-loop', `${e.type} on ${byId.get(e.src)?.title ?? e.src}`);
  }

  // ── orphans ───────────────────────────────────────────────────────────────
  const touched = new Set<string>();
  for (const e of edges) {
    touched.add(e.src);
    touched.add(e.dst);
  }
  for (const n of nodes) {
    if (!touched.has(n.id)) add('warn', 'orphan-node', `[${n.type}] ${n.title} (${n.id})`);
  }

  // ── merged_into pointing somewhere useless ────────────────────────────────
  for (const n of trash) {
    if (!n.merged_into) continue;
    if (!byId.has(n.merged_into)) {
      add('error', 'broken-merge', `${n.title} (${n.id}) merged_into ${n.merged_into}, which is not live`);
    }
  }

  // ── identity key collisions ───────────────────────────────────────────────
  const keyOwner = new Map<string, string>();
  for (const n of nodes) {
    for (const k of n.identity_keys ?? []) {
      const prev = keyOwner.get(k);
      if (prev && prev !== n.id) add('error', 'identity-collision', `${k}: ${prev} and ${n.id}`);
      else keyOwner.set(k, n.id);
    }
  }

  // ── more than one is_self ─────────────────────────────────────────────────
  const selves = nodes.filter((n) => n.type === 'person' && (n.props as { is_self?: boolean }).is_self);
  if (selves.length === 0) add('error', 'self-anchor', 'no person node has props.is_self === true');
  if (selves.length > 1) {
    add('error', 'self-anchor', `${selves.length} nodes claim is_self: ${selves.map((n) => n.id).join(', ')}`);
  }

  // ── status contradicting dates ────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  for (const n of nodes) {
    const status = (n.props as { status?: string; goal_status?: string }).status;
    if (status === 'active' && n.end_date && n.end_date < today) {
      add('warn', 'stale-status', `[${n.type}] ${n.title} is 'active' but ended ${n.end_date}`);
    }
    if (n.start_date && n.end_date && n.end_date < n.start_date) {
      add('error', 'inverted-dates', `[${n.type}] ${n.title}: ${n.start_date} .. ${n.end_date}`);
    }
  }
  for (const e of edges) {
    if (e.start_date && e.end_date && e.end_date < e.start_date) {
      add('error', 'inverted-dates', `${e.type} ${e.id}: ${e.start_date} .. ${e.end_date}`);
    }
    if (e.is_current === true && e.end_date && e.end_date < today) {
      add('warn', 'stale-current', `${e.type} ${e.id} is_current but ended ${e.end_date}`);
    }
  }

  // ── a typed relation exists for what RELATES_TO is being used for ─────────
  // RELATES_TO is the catch-all; when both endpoints would satisfy a specific
  // edge type, the specific one carries meaning the generic one loses.
  const TYPED_ALTERNATIVES: Array<[EdgeType, string, string]> = [
    ['ORG_RELATED', 'organization', 'organization'],
    ['MEMBER_OF', 'person', 'organization'],
    ['STUDIED_AT', 'person', 'organization'],
  ];
  for (const e of edges.filter((x) => x.type === 'RELATES_TO')) {
    const s = byId.get(e.src);
    const d = byId.get(e.dst);
    if (!s || !d) continue;
    for (const [alt, st, dt] of TYPED_ALTERNATIVES) {
      if (s.type === st && d.type === dt) {
        add('warn', 'generic-relation', `RELATES_TO ${s.title} -> ${d.title} could be ${alt}`);
      }
    }
  }

  // A generic RELATES_TO alongside a typed edge between the same two records is
  // pure redundancy: the typed edge already carries the meaning, and the pair
  // now has to be kept in sync by hand.
  const pairTypes = new Map<string, Set<string>>();
  for (const e of edges) {
    const k = `${e.src}|${e.dst}`;
    pairTypes.set(k, (pairTypes.get(k) ?? new Set()).add(e.type));
  }
  for (const [k, types] of pairTypes) {
    if (types.size < 2 || !types.has('RELATES_TO')) continue;
    const [src, dst] = k.split('|');
    const others = [...types].filter((t) => t !== 'RELATES_TO');
    add(
      'warn',
      'redundant-relation',
      `${byId.get(src!)?.title} -> ${byId.get(dst!)?.title}: RELATES_TO alongside ${others.join(', ')}`,
    );
  }

  // ── ownership ─────────────────────────────────────────────────────────────
  // Subject-bearing records must say whose they are. An unowned record is not a
  // harmless gap: read models that scope to the owner will skip it, and ones
  // that do not will hand it to whoever asks, which is how other people's
  // degrees reached the résumé.
  const ownerIndex = buildOwnerIndex({ nodesById: byId, edges });
  for (const id of ownerIndex.unowned) {
    const n = byId.get(id)!;
    add('warn', 'unowned-record', `[${n.type}] ${n.title} (${id}), no subject edge, belongs to nobody`);
  }
  for (const id of ownerIndex.contested) {
    const n = byId.get(id)!;
    add('error', 'contested-record', `[${n.type}] ${n.title} (${id}), more than one person claims it`);
  }

  const self = selves[0];
  if (self) {
    const counts = new Map<string, number>();
    for (const [, personId] of ownerIndex.ownerOf) counts.set(personId, (counts.get(personId) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    console.log('\nrecords by owner');
    for (const [personId, count] of ranked.slice(0, 10)) {
      const p = byId.get(personId);
      const mark = personId === self.id ? ' (you)' : '';
      console.log(`  ${String(count).padStart(4)}  ${(p?.title ?? personId).slice(0, 48)}${mark}`);
    }
    if (ranked.length > 10) console.log(`  ... and ${ranked.length - 10} more people`);
  }

  // ── report ────────────────────────────────────────────────────────────────
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  console.log('\n── findings ───────────────────────────────────────────────────');
  if (findings.length === 0) {
    console.log('  none, graph is clean');
  } else {
    const groups = new Map<string, Finding[]>();
    for (const f of findings) groups.set(f.check, [...(groups.get(f.check) ?? []), f]);
    for (const [check, list] of [...groups.entries()].sort()) {
      const mark = list[0]!.severity === 'error' ? '✘' : '·';
      console.log(`\n  ${mark} ${check} (${list.length})`);
      for (const f of list.slice(0, 15)) console.log(`      ${f.detail}`);
      if (list.length > 15) console.log(`      ... and ${list.length - 15} more`);
    }
  }

  console.log(
    `\n${errors.length === 0 ? '✅' : '❌'} ${errors.length} error(s), ${warns.length} warning(s)`,
  );
  process.exit(errors.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
