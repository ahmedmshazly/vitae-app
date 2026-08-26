import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';
import { todayIso } from '../../db/timezone.js';
import { searchIndex } from '../../db/search-index.js';
import { loadGraph, personStrength, recomputeAndPersistStrength } from '../../services/crm.js';
import { createHash } from 'node:crypto';

export const interactionsRouter: Router = Router();

/**
 * One-tap interaction logger (SRS FR-CON-002/003): create the interaction node,
 * a WITH edge to the person, any follow-up reminders, and immediately recompute
 * that person's strength.
 *
 * FR-002: the node, edge, revisions, and reminders commit in ONE transaction.
 * Previously each was a separate write, so a mid-sequence failure could leave an
 * interaction with no edge (invisible to the person page, but counted by CRM) or
 * reminders with no interaction.
 */
interactionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { personId, kind, summary, note, occurredAt, initiatedBy, followUps, followUpDate, idempotencyKey } = req.body ?? {};
    if (!personId || !kind) throw new HttpError(400, 'BAD_REQUEST', 'personId and kind are required.');

    // Normalize the one-tap logger shape ({note, followUpDate}) onto the full shape.
    const allFollowUps: Array<{ what: string; due?: string }> = [...((followUps ?? []) as Array<{ what: string; due?: string }>)];
    if (followUpDate) {
      allFollowUps.push({ what: note || summary || `Follow up (${kind})`, due: String(followUpDate) });
    }

    // Validate the whole request before anything is written.
    const requestKey = String(idempotencyKey ?? req.header('x-idempotency-key') ?? newId());
    if (requestKey.length > 200) throw new HttpError(400, 'BAD_REQUEST', 'idempotency key is too long');
    const stableId = (suffix: string): string =>
      `interaction-${createHash('sha256').update(`${personId}\0${requestKey}\0${suffix}`).digest('hex').slice(0, 40)}`;
    const interactionId = stableId('node');
    const edgeId = stableId('with');
    const nodeInput = repository.parseNodeCreate({
      type: 'interaction',
      title: summary || note || `${kind}`,
      props: {
        kind,
        occurred_at: occurredAt ?? nowIso(),
        note: note ?? '',
        follow_ups: allFollowUps,
        // Direction is an operator-stated fact, never inferred; absent stays absent.
        ...(initiatedBy ? { initiated_by: initiatedBy } : {}),
      },
      source: 'manual',
    });
    const edgeInput = repository.parseEdgeCreate({
      type: 'WITH',
      src: interactionId,
      dst: personId,
      source: 'manual',
    });

    const actor = req.user?.email;
    const reminderIds = allFollowUps.filter((fu) => fu.what).map((_fu, index) => stableId(`reminder:${index}`));
    const result = await repository.transaction(async (tx) => {
      // Idempotency: both ids are derived from the request, so a retried POST
      // must return the original records rather than create a second pair.
      const [existingInteraction, existingEdge] = await Promise.all([
        repository.getNode(interactionId, { includeDeleted: true }, tx),
        repository.getEdge(edgeId, { includeDeleted: true }, tx),
      ]);
      if (existingInteraction && existingEdge) {
        return { interaction: existingInteraction, edge: existingEdge, reminderIds, replayed: true };
      }
      // READ phase: the person must exist; the interaction is created here, so
      // declare it as pending rather than reading it back.
      await repository.assertEdgeEndpoints(tx, edgeInput, new Map([[interactionId, 'interaction']]));

      // WRITE phase.
      const node = await repository.stageNode(tx, nodeInput, { actor }, { id: interactionId });
      const withEdge = await repository.stageEdge(tx, edgeInput, { actor }, { id: edgeId });

      let reminderIndex = 0;
      for (const fu of allFollowUps) {
        if (!fu.what) continue;
        const id = reminderIds[reminderIndex++]!;
        await repository.docPut('reminders', id, {
          id,
          subject_kind: 'node',
          subject_id: personId,
          related_interaction: interactionId,
          due_on: fu.due ?? todayIso(), // FR-025: local calendar date
          reason: 'follow_up',
          note: fu.what,
          status: 'open',
          created_from: 'interaction',
          created_at: nowIso(),
        }, {}, tx);
      }
      return { interaction: node, edge: withEdge, reminderIds, replayed: false };
    });

    searchIndex.markDirty();
    let strength: Awaited<ReturnType<typeof personStrength>> | null = null;
    let postprocessWarning: string | undefined;
    try {
      // FR-102: read the post-commit graph once. Both calls score the same
      // person from the same inputs; recompute only writes derived fields
      // (strength, last_interaction_at) that neither call reads back.
      const graph = await loadGraph();
      await recomputeAndPersistStrength(personId, graph); // immediate recompute (SRS FR-CON-009)
      strength = await personStrength(personId, graph);
    } catch (error) {
      // The durable aggregate already committed. Never turn that success into
      // an ambiguous 500; the next CRM read/recompute can repair this cache.
      postprocessWarning = `strength recompute deferred: ${String(error)}`;
    }

    res.status(201).json({
      interaction: result.interaction,
      edge: result.edge,
      reminders: result.reminderIds,
      strength,
      replayed: result.replayed,
      warning: postprocessWarning,
    });
  }),
);

/** Undo a just-logged interaction: soft-delete it and re-derive strength. */
interactionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const node = await repository.getNode(req.params.id);
    if (!node || node.type !== 'interaction') throw new HttpError(404, 'NOT_FOUND', 'Interaction not found.');

    const withEdge = (await repository.edgesForNode(node.id)).find((e) => e.type === 'WITH' && e.src === node.id);
    await repository.softDeleteNode(node.id, { actor: req.user?.email });
    searchIndex.markDirty();
    if (withEdge) await recomputeAndPersistStrength(withEdge.dst);
    res.json({ ok: true });
  }),
);
