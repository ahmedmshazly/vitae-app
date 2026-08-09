import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { findKnowsEdge, loadGraph, peopleList, personStrength } from '../../services/crm.js';
import { personProfile } from '../../services/profile.js';
import { repository } from '../../db/repository.js';

export const peopleRouter: Router = Router();

/** People list with live tie-strengths (reference P: people). */
peopleRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ people: await peopleList() });
  }),
);

/**
 * One-call person summary for the profile page: strength decomposition,
 * relationship props (closeness/cadence/topics/met), and the favor ledger.
 */
peopleRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const person = await repository.getNode(req.params.id);
    if (!person || person.type !== 'person') throw new HttpError(404, 'NOT_FOUND', 'Person not found.');
    // FR-102: both helpers read the whole graph. Load it once and thread it, or
    // a single profile view costs four full-collection scans.
    const graph = await loadGraph();
    const [strength, knows] = await Promise.all([
      personStrength(req.params.id, graph),
      findKnowsEdge(req.params.id, graph),
    ]);
    const kprops = (knows?.props ?? {}) as Record<string, unknown>;
    res.json({
      strength,
      relationship: {
        relation: (kprops.relation as string) ?? null,
        closeness: (kprops.closeness as number) ?? null,
        cadenceTargetDays: (kprops.cadence_target_days as number) ?? null,
        metVia: (kprops.met_via as string) ?? null,
        topics: (kprops.topics as string[]) ?? [],
        // The KNOWS edge id + full props power the relationship editor
        // (FR-CON-001); PATCH replaces props wholesale, so the client merges.
        edgeId: knows?.id ?? null,
        doNotPing: (kprops.do_not_ping as boolean) ?? false,
        metOn: (kprops.met_on as string) ?? null,
        knowsProps: kprops,
      },
      favors: (kprops.favors as unknown[]) ?? [],
    });
  }),
);

/**
 * The records this person owns, grouped the way a CV reads.
 *
 * Distinct from `/summary`, which answers "what is my relationship with them".
 * This answers "what have they done", and it is the surface that makes the
 * imported profiles useful instead of merely present.
 */
peopleRouter.get(
  '/:id/profile',
  asyncHandler(async (req, res) => {
    const profile = await personProfile(req.params.id);
    if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Person not found.');
    res.json(profile);
  }),
);
