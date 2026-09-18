import { Router } from 'express';
import { knowsProps } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';
import { findKnowsEdge } from '../../services/crm.js';

/**
 * Favor ledger (SRS FR-CON reciprocity). Favors live on the self→person KNOWS
 * edge (`props.favors`), exactly where who-to-call reads its reciprocity
 * factor, so writing here immediately affects ask rankings.
 *
 * FR-019: this route used to define its own `Favor` shape with a `note` field
 * while the canonical `knowsProps` schema requires `what`. A favor written here
 * validated on the way in and then made the *next* ordinary edit of that
 * relationship fail validation. There is one shape now, and it is the schema's.
 */
export const favorsRouter: Router = Router({ mergeParams: true });

type Favor = NonNullable<ReturnType<typeof knowsProps.parse>['favors']>[number] & {
  id?: string;
  created_at?: string;
};

async function edgeOr404(personId: string) {
  const edge = await findKnowsEdge(personId);
  if (!edge) throw new HttpError(404, 'NOT_FOUND', 'No KNOWS relationship with this person.');
  return edge;
}

function favorsOf(props: Record<string, unknown>): Favor[] {
  return ((props.favors as Array<Favor & { note?: string }>) ?? []).map((f) => {
    const { note, ...canonical } = f;
    return { ...canonical, what: f.what ?? note ?? '' };
  });
}

/** Read-migrate-mutate-write inside one transaction to avoid lost updates. */
async function mutateFavors(
  edgeId: string,
  actor: string | undefined,
  mutate: (favors: Favor[]) => Favor[],
): Promise<Favor[]> {
  return repository.transaction(async (tx) => {
    const edge = await repository.getEdge(edgeId, { includeDeleted: true }, tx);
    if (!edge) throw new HttpError(404, 'NOT_FOUND', 'KNOWS relationship not found.');
    if (edge.type !== 'KNOWS' || edge.deleted_at)
      throw new HttpError(409, 'EDGE_CHANGED', 'KNOWS relationship changed.');
    const props = (edge.props ?? {}) as Record<string, unknown>;
    const favors = mutate(favorsOf(props));
    // Older strength recomputations persisted null before the first contact.
    // The canonical optional date is absent, not null; retain every other prop.
    const parsed = knowsProps
      .passthrough()
      .safeParse({ ...props, last_interaction_at: props.last_interaction_at ?? undefined, favors });
    if (!parsed.success)
      throw new HttpError(422, 'VALIDATION', 'invalid favor', parsed.error.issues);
    await repository.stageEdgeUpdate(tx, edge, { props: parsed.data }, { op: 'update', actor });
    return (parsed.data.favors ?? []) as Favor[];
  });
}

favorsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(req.params.personId);
    const current = favorsOf((edge.props ?? {}) as Record<string, unknown>);
    const hasLegacy = (
      ((edge.props as Record<string, unknown>)?.favors as Array<{ note?: string }> | undefined) ??
      []
    ).some((favor) => favor.note !== undefined);
    const favors = hasLegacy
      ? await mutateFavors(edge.id, req.user?.email, (existing) => existing)
      : current;
    res.json({ favors });
  }),
);

favorsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { direction, what, note, on } = req.body ?? {};
    if (direction !== 'owed_to_me' && direction !== 'owed_by_me') {
      throw new HttpError(400, 'BAD_REQUEST', "direction must be 'owed_to_me' or 'owed_by_me'.");
    }
    // `note` is accepted as an alias so existing clients keep working.
    const description = String(what ?? note ?? '').trim();
    if (!description) throw new HttpError(400, 'BAD_REQUEST', 'what is required.');

    const edge = await edgeOr404(req.params.personId);
    const favorId = String(req.header('x-idempotency-key') ?? newId());
    const favors = await mutateFavors(edge.id, req.user?.email, (current) => {
      if (current.some((favor) => favor.id === favorId)) return current;
      return [
        ...current,
        {
          id: favorId,
          direction,
          what: description,
          ...(on ? { on: String(on) } : {}),
          settled: false,
          created_at: nowIso(),
        },
      ];
    });
    res.status(201).json({ favors });
  }),
);

favorsRouter.patch(
  '/:favorId',
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(req.params.personId);
    const favors = await mutateFavors(edge.id, req.user?.email, (current) => {
      if (!current.some((f) => f.id === req.params.favorId)) {
        throw new HttpError(404, 'NOT_FOUND', 'Favor not found.');
      }
      return current.map((f) =>
        f.id === req.params.favorId ? { ...f, settled: Boolean(req.body?.settled ?? true) } : f,
      );
    });
    res.json({ favors });
  }),
);
