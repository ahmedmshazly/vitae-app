import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { nowIso } from '../../db/util.js';
import { isoDateIn, todayIso } from '../../db/timezone.js';

export const remindersRouter: Router = Router();

remindersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const open = await repository.docQuery<Record<string, unknown>>('reminders', { status: 'open' });
    const today = todayIso();
    const reminders = open
      .filter((r) => (req.query.due === 'all' ? true : (r.due_on as string) <= today) || (r.snoozed_until && (r.snoozed_until as string) <= today))
      .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
    res.json({ reminders });
  }),
);

remindersRouter.post(
  '/:id/done',
  asyncHandler(async (req, res) => {
    await repository.docMerge('reminders', req.params.id, { status: 'done', done_at: nowIso() });
    res.json({ ok: true });
  }),
);

remindersRouter.post(
  '/:id/reopen',
  asyncHandler(async (req, res) => {
    await repository.docMerge('reminders', req.params.id, { status: 'open', done_at: null });
    res.json({ ok: true });
  }),
);

remindersRouter.post(
  '/:id/snooze',
  asyncHandler(async (req, res) => {
    const days = Number(req.body?.days ?? 7);
    const until = isoDateIn(days); // FR-025: snooze lands on a local calendar date
    await repository.docMerge('reminders', req.params.id, { status: 'snoozed', snoozed_until: until, due_on: until });
    res.json({ ok: true, snoozed_until: until });
  }),
);
