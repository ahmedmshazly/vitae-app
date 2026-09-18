import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { nowIso } from '../../db/util.js';
import { isoDateIn, todayIso } from '../../db/timezone.js';
import { openReminders } from '../../services/reminders.js';

export const remindersRouter: Router = Router();

remindersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const today = todayIso();
    const open = await openReminders(today);
    const reminders = open
      .filter((r) => req.query.due === 'all' || (r.due_on as string) <= today);
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
    await repository.docMerge('reminders', req.params.id, { status: 'open', done_at: null, snoozed_until: null });
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
