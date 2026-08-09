import { Router } from 'express';
import { findIntroPaths, type PathGraphEdge, type PathGraphNode } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { getSelf } from '../../services/self.js';
import { orgsOverview, peopleList } from '../../services/crm.js';

export const introsRouter: Router = Router();

/**
 * Path edges with live strengths: self↔person KNOWS edges get the freshly
 * computed tie strength (persisted strength lags until an interaction logs);
 * third-party KNOWS edges keep persisted strength or a neutral default.
 */
async function pathEdgesWithLiveStrengths(
  edges: Awaited<ReturnType<typeof repository.allLiveEdges>>,
  selfId: string,
): Promise<PathGraphEdge[]> {
  const people = await peopleList();
  const liveStrength = new Map(people.map((p) => [p.id, p.strength]));
  return edges.map((e) => {
    let strength = ((e.props ?? {}) as Record<string, unknown>).strength as number | undefined;
    if (e.type === 'KNOWS') {
      const other = e.src === selfId ? e.dst : e.dst === selfId ? e.src : null;
      if (other && liveStrength.has(other)) strength = liveStrength.get(other);
      else if (strength == null) strength = 0.3; // third-party tie, unobserved
    }
    return { src: e.src, dst: e.dst, type: e.type, strength };
  });
}

/**
 * Intro targets: organizations worth reaching, annotated with your current
 * application stage (if any) and reach (hop count of the best path).
 */
introsRouter.get(
  '/targets',
  asyncHandler(async (_req, res) => {
    const [orgs, nodes, edges, self] = await Promise.all([
      orgsOverview(),
      repository.allLiveNodes(),
      repository.allLiveEdges(),
      getSelf(),
    ]);
    if (!self) return res.json({ targets: [] });

    // Application stage per org (application -APPLIED_TO-> org).
    const stageByOrg = new Map<string, string>();
    const apps = new Map(nodes.filter((n) => n.type === 'application').map((n) => [n.id, n]));
    for (const e of edges) {
      if (e.type !== 'APPLIED_TO') continue;
      const app = apps.get(e.src);
      if (!app) continue;
      const p = app.props as Record<string, unknown>;
      stageByOrg.set(e.dst, String(p.stage ?? p.status ?? 'applied'));
    }

    const pathNodes: PathGraphNode[] = nodes.map((n) => ({ id: n.id, type: n.type, title: n.title }));
    const pathEdges = await pathEdgesWithLiveStrengths(edges, self.id);

    const targets = orgs.map((o) => {
      const best = findIntroPaths(pathNodes, pathEdges, self.id, o.id, { maxPaths: 1 })[0];
      const personHops = best ? best.hops.length - 2 : null; // minus self and org
      return {
        ...o,
        stage: stageByOrg.get(o.id) ?? null,
        reach: personHops == null ? 'no path' : personHops <= 1 ? 'direct' : `${personHops} hops`,
        reachable: Boolean(best),
      };
    });

    // Pursued orgs first (application stage), then by affinity.
    targets.sort((a, b) => Number(Boolean(b.stage)) - Number(Boolean(a.stage)) || b.affinity - a.affinity);
    res.json({ targets });
  }),
);

/** Ranked warm-intro paths into one org. */
introsRouter.get(
  '/paths',
  asyncHandler(async (req, res) => {
    const orgId = String(req.query.orgId ?? '');
    if (!orgId) throw new HttpError(400, 'BAD_REQUEST', 'orgId is required.');
    const [nodes, edges, self] = await Promise.all([
      repository.allLiveNodes(),
      repository.allLiveEdges(),
      getSelf(),
    ]);
    if (!self) return res.json({ paths: [] });
    const org = nodes.find((n) => n.id === orgId && n.type === 'organization');
    if (!org) throw new HttpError(404, 'NOT_FOUND', 'Organization not found.');

    const paths = findIntroPaths(
      nodes.map((n) => ({ id: n.id, type: n.type, title: n.title })),
      await pathEdgesWithLiveStrengths(edges, self.id),
      self.id,
      orgId,
    );

    // Explanation per path: name the asker (first person hop) and the mechanism.
    const enriched = paths.map((p) => {
      const persons = p.hops.filter((h) => h.type === 'person' && h.nodeId !== self.id);
      const asker = persons[0] ?? null;
      const lastHop = p.hops[p.hops.length - 1];
      const why =
        persons.length === 0
          ? 'You are directly affiliated.'
          : persons.length === 1
            ? `${asker!.title} ${lastHop?.viaEdgeType === 'works_at' ? `works at ${org.title}` : `can reach ${org.title}`}, a single warm hop.`
            : `${persons.map((h) => h.title).join(' → ')} chains into ${org.title}; each hop dilutes the ask.`;

      const factors: string[] = [];
      if (persons.length === 0) factors.push('Affiliated');
      else if (persons.length === 1) factors.push('1 hop');
      else factors.push(`${persons.length} hops`);
      if (lastHop?.viaEdgeType === 'works_at') factors.push('Works there');
      if (lastHop?.viaEdgeType === 'introduced') factors.push('Introduced');
      const knowsHops = p.hops.filter((h) => h.viaEdgeType === 'knows' && h.viaStrength != null);
      const minKnows = knowsHops.length
        ? Math.min(...knowsHops.map((h) => h.viaStrength ?? 1))
        : null;
      if (minKnows != null) {
        if (minKnows >= 0.55) factors.push('Strong tie');
        else if (minKnows >= 0.3) factors.push('Medium tie');
        else factors.push('Weak tie');
      }
      if (p.score >= 0.5) factors.push('Strong path');
      else if (p.score >= 0.25) factors.push('Medium path');
      else factors.push('Weak path');

      return {
        hops: p.hops,
        score: Number(p.score.toFixed(3)),
        strengthLabel: p.score >= 0.5 ? 'strong' : p.score >= 0.25 ? 'medium' : 'weak',
        askerId: asker?.nodeId ?? null,
        askerName: asker?.title ?? null,
        why,
        factors,
      };
    });

    res.json({ org: { id: org.id, title: org.title }, paths: enriched });
  }),
);
