import { Router } from 'express';
import { computeStreak } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';
import { todayIso } from '../../db/timezone.js';

export const habitsRouter: Router = Router();

/** Habits are nodes (type 'habit'); checks live in habit_checks as one doc per day. */
habitsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const today = todayIso(); // FR-025: streaks are broken by local midnight
    const [nodes, checksSnap] = await Promise.all([
      repository.allLiveNodes(),
      repository.docList<{ habit_id: string; date: string }>('habit_checks'),
    ]);
    const habits = nodes.filter((n) => n.type === 'habit');
    const checksByHabit = new Map<string, string[]>();
    for (const { habit_id, date } of checksSnap) {
      (checksByHabit.get(habit_id) ?? checksByHabit.set(habit_id, []).get(habit_id)!).push(date);
    }
    res.json({
      habits: habits.map((h) => {
        const dates = checksByHabit.get(h.id) ?? [];
        const s = computeStreak(dates, today);
        return {
          id: h.id,
          title: h.title,
          cadence: (h.props as Record<string, unknown>).cadence ?? 'daily',
          streak: s.current,
          best: s.best,
          grid: s.grid,
          checkedToday: dates.includes(today),
        };
      }),
    });
  }),
);

habitsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, cadence } = req.body ?? {};
    if (!title) throw new HttpError(400, 'BAD_REQUEST', 'title is required.');
    const habit = await repository.createNode(
      { type: 'habit', title, props: { cadence: cadence ?? 'daily' }, source: 'manual' },
      { actor: req.user?.email },
    );
    res.status(201).json({ habit });
  }),
);

/** Toggle a day's check (defaults to today). Doc id habitId_date makes it idempotent. */
habitsRouter.post(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const habitId = req.params.id;
    const date = String(req.body?.date ?? todayIso());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'BAD_REQUEST', 'date must be YYYY-MM-DD.');
    const habit = await repository.getNode(habitId);
    if (!habit || habit.type !== 'habit') throw new HttpError(404, 'NOT_FOUND', 'Habit not found.');

    // The id is derived from habit+date, so checking twice is idempotent and a
    // second tap toggles rather than stacking duplicates.
    const checkId = `${habitId}_${date}`;
    const existing = await repository.docGet('habit_checks', checkId);
    let checked: boolean;
    if (existing) {
      await repository.docDelete('habit_checks', checkId);
      checked = false;
    } else {
      await repository.docPut('habit_checks', checkId, { id: newId(), habit_id: habitId, date, created_at: nowIso() });
      checked = true;
    }
    res.json({ ok: true, checked, date });
  }),
);
