import { Router } from 'express';
import { composeDraft, type ComposerKind, type ComposerTone } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';
import { isoDateIn } from '../../db/timezone.js';
import { searchIndex } from '../../db/search-index.js';
import { findKnowsEdge, loadGraph, personStrength, recomputeAndPersistStrength } from '../../services/crm.js';
import { getSettings } from '../../services/settings.js';

export const composerRouter: Router = Router();

const KINDS: ComposerKind[] = ['intro', 'referral', 'nudge', 'reconnect', 'explore'];
const TONES: ComposerTone[] = ['warm', 'direct', 'formal'];

/** Gather real relationship facts for the draft (deterministic, no LLM). */
async function factsFor(personId: string, kind: ComposerKind): Promise<string[]> {
  const facts: string[] = [];
  // FR-102: one graph read shared by both helpers, not one each.
  const graph = await loadGraph();
  const [strength, knows] = await Promise.all([
    personStrength(personId, graph),
    findKnowsEdge(personId, graph),
  ]);
  const kprops = (knows?.props ?? {}) as Record<string, unknown>;

  if (strength.daysSinceLast != null) {
    const d = Math.round(strength.daysSinceLast);
    facts.push(kind === 'reconnect' ? `We last spoke about ${d} days ago` : `We last caught up ${d} days ago`);
  }
  const metVia = kprops.met_via as string | undefined;
  if (metVia) facts.push(`We met via ${metVia}`);
  const favors = (kprops.favors as Array<{ direction: string; settled?: boolean; note?: string }>) ?? [];
  const owed = favors.find((f) => f.direction === 'owed_to_me' && !f.settled);
  if (owed?.note) facts.push(`Context: ${owed.note}`);
  return facts;
}

/** Build a draft server-side from live relationship data. */
composerRouter.post(
  '/draft',
  asyncHandler(async (req, res) => {
    const { personId, kind, tone, targetPersonId, targetOrgId, roleTitle } = req.body ?? {};
    if (!personId) throw new HttpError(400, 'BAD_REQUEST', 'personId is required.');
    if (!KINDS.includes(kind)) throw new HttpError(400, 'BAD_REQUEST', `kind must be one of ${KINDS.join(', ')}.`);
    if (!TONES.includes(tone)) throw new HttpError(400, 'BAD_REQUEST', `tone must be one of ${TONES.join(', ')}.`);

    const person = await repository.getNode(String(personId));
    if (!person || person.type !== 'person') throw new HttpError(404, 'NOT_FOUND', 'Person not found.');

    const [target, org, settings, facts] = await Promise.all([
      targetPersonId ? repository.getNode(String(targetPersonId)) : null,
      targetOrgId ? repository.getNode(String(targetOrgId)) : null,
      getSettings(),
      factsFor(person.id, kind),
    ]);

    const body = composeDraft({
      kind,
      tone,
      askerName: person.title,
      targetName: target?.title,
      targetOrg: org?.title,
      roleTitle: roleTitle ? String(roleTitle) : undefined,
      facts,
      senderName: settings.profile.name.split(/\s+/)[0] || 'Me',
    });

    res.json({ body, facts });
  }),
);

/** "Send" = log an outreach interaction + queue a follow-up reminder (+7d). */
composerRouter.post(
  '/send',
  asyncHandler(async (req, res) => {
    const { personId, kind, channel, body } = req.body ?? {};
    if (!personId || !body) throw new HttpError(400, 'BAD_REQUEST', 'personId and body are required.');
    const person = await repository.getNode(String(personId));
    if (!person || person.type !== 'person') throw new HttpError(404, 'NOT_FOUND', 'Person not found.');

    // FR-002: interaction node, WITH edge, and the follow-up reminder commit
    // together, an outreach with no edge would be invisible on the person page
    // while still counting toward their tie strength.
    const interactionId = repository.allocateId();
    const nodeInput = repository.parseNodeCreate({
      type: 'interaction',
      title: `Outreach: ${kind ?? 'message'} via ${channel ?? 'email'}`,
      props: { kind: 'outreach', ask_kind: kind ?? null, channel: channel ?? 'email', occurred_at: nowIso(), note: String(body) },
      source: 'manual',
    });
    const edgeInput = repository.parseEdgeCreate({
      type: 'WITH',
      src: interactionId,
      dst: person.id,
      source: 'manual',
    });

    const due = isoDateIn(7); // FR-025: +7 local calendar days
    const reminderId = newId();
    const actor = req.user?.email;

    const interaction = await repository.transaction(async (tx) => {
      await repository.assertEdgeEndpoints(tx, edgeInput, new Map([[interactionId, 'interaction']]));

      const node = await repository.stageNode(tx, nodeInput, { actor }, { id: interactionId });
      await repository.stageEdge(tx, edgeInput, { actor });
      await repository.docPut('reminders', reminderId, {
        id: reminderId,
        subject_kind: 'node',
        subject_id: person.id,
        related_interaction: interactionId,
        due_on: due,
        reason: 'follow_up',
        note: `Follow up with ${person.title} (${kind ?? 'outreach'})`,
        status: 'open',
        created_from: 'composer',
        created_at: nowIso(),
      }, {}, tx);
      return node;
    });

    searchIndex.markDirty();
    await recomputeAndPersistStrength(person.id);
    res.status(201).json({ interaction, reminderId, followUpOn: due });
  }),
);
