import { Router } from 'express';
import { computeStreak } from '@vitae/core';
import { asyncHandler } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { calendarDaysBetween, todayIso } from '../../db/timezone.js';
import { loadGraph, reconnectLane } from '../../services/crm.js';
import { getSelf } from '../../services/self.js';
import { buildOwnerIndex, ownableFrom } from '../../services/subjects.js';
import { githubToken } from '../../services/settings.js';
import { loadScorableAtoms } from '../../services/resume.js';

export const dashboardRouter: Router = Router();

/** Pipeline stages in board order (reference Today view). */
const PIPELINE_STAGES = ['applied', 'screening', 'interview', 'offer'] as const;
/** Momentum factor weights (sum to 100), surfaced so the ring is explainable. */
const MOMENTUM_WEIGHTS = { habits: 40, reconnect: 30, reminders: 20, capture: 10 } as const;

/** Dashboard "Today" aggregate (SRS FR-VIS-004). One call, several widgets. */
dashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const today = todayIso(); // FR-025: the user's calendar date, not UTC's
    // FR-102: load the graph and atoms once; reconnectLane and loadScorableAtoms
    // reuse that snapshot instead of each reloading the full graph.
    const [graph, remindersSnap, resumesSnap, checksSnap, atomsSnap] = await Promise.all([
      loadGraph(),
      repository.docQuery<Record<string, unknown>>('reminders', { status: 'open' }),
      repository.docList('resumes'),
      repository.docList('habit_checks'),
      repository.docList('atoms'),
    ]);
    const nodes = [...graph.nodes.values()];
    const edges = graph.edges;
    const [lane, scorable] = await Promise.all([reconnectLane(graph), loadScorableAtoms(atomsSnap)]);

    const reminders = remindersSnap.filter((r) => (r.due_on as string) <= today);
    const applications = nodes.filter((n) => n.type === 'application');
    const recent = [...nodes]
      .filter((n) => n.type !== 'interaction')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
      .map((n) => ({ id: n.id, type: n.type, title: n.title, created_at: n.created_at, source: n.source }));

    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;

    // "How much is in the graph" and "how much of it is mine" stopped being the
    // same number once imports brought in other people's profiles. Report both
    // rather than a single figure that silently means neither.
    const ownerIndex = buildOwnerIndex(ownableFrom(graph));
    const self = await getSelf();
    const mineIds = self ? (ownerIndex.recordsOf.get(self.id) ?? new Set<string>()) : new Set<string>();
    const mineByType: Record<string, number> = {};
    for (const n of nodes) {
      if (mineIds.has(n.id)) mineByType[n.type] = (mineByType[n.type] ?? 0) + 1;
    }
    // The self-profile is the graph's anchor, not a person in the user's
    // directory. Keep this count aligned with GET /people.
    const peopleCount = nodes.filter(
      (n) => n.type === 'person' && (n.props as Record<string, unknown>).is_self !== true,
    ).length;

    // Application pipeline counts by stage (props.stage, falling back to props.status).
    const pipelineCounts: Record<string, number> = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0]));
    for (const a of applications) {
      const p = a.props as Record<string, unknown>;
      const stage = String(p.stage ?? p.status ?? '').toLowerCase();
      if (stage in pipelineCounts) pipelineCounts[stage] += 1;
    }

    // Habit streaks (30-day grids).
    const habitNodes = nodes.filter((n) => n.type === 'habit');
    const checksByHabit = new Map<string, string[]>();
    for (const check of checksSnap as Array<{ habit_id: string; date: string }>) {
      const { habit_id, date } = check;
      (checksByHabit.get(habit_id) ?? checksByHabit.set(habit_id, []).get(habit_id)!).push(date);
    }
    const habits = habitNodes.map((h) => {
      const dates = checksByHabit.get(h.id) ?? [];
      const s = computeStreak(dates, today);
      return { id: h.id, title: h.title, streak: s.current, grid: s.grid, checkedToday: dates.includes(today) };
    });

    // ── Focus: open tasks + goals with key-result progress ──────────────────
    const OPEN_TASK = (s: string) => s !== 'done' && s !== 'dropped';
    const tasks = nodes
      .filter((n) => n.type === 'task' && OPEN_TASK(String((n.props as Record<string, unknown>).status ?? 'inbox')))
      .map((n) => {
        const p = n.props as Record<string, unknown>;
        return { id: n.id, title: n.title, due: (p.due as string) ?? null, priority: (p.priority as string) ?? null, status: (p.status as string) ?? 'inbox' };
      })
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
      .slice(0, 6);

    const goals = nodes
      .filter((n) => {
        const st = String((n.props as Record<string, unknown>).goal_status ?? 'active');
        return n.type === 'goal' && st !== 'achieved' && st !== 'abandoned';
      })
      .map((n) => {
        const krs = ((n.props as Record<string, unknown>).key_results as Array<Record<string, unknown>>) ?? [];
        const parts = krs.map((k) => {
          if (k.done === true) return 1;
          const target = Number(k.target);
          const current = Number(k.current);
          if (Number.isFinite(target) && target > 0 && Number.isFinite(current)) return Math.max(0, Math.min(1, current / target));
          return 0;
        });
        const progress = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
        return { id: n.id, title: n.title, progress, keyResults: krs.length };
      })
      .slice(0, 4);

    // ── Upcoming & on-this-day (next 30 days + anniversaries today) ──────────
    const upcoming: Array<{ id: string; type: string; title: string; date: string; label: string }> = [];
    const within = (d: string | undefined, max = 30) => {
      if (!d) return false;
      const n = calendarDaysBetween(today, d.slice(0, 10));
      return n >= 0 && n <= max;
    };
    for (const n of nodes) {
      const p = n.props as Record<string, unknown>;
      if (n.type === 'event' && within(p.starts_at as string)) upcoming.push({ id: n.id, type: n.type, title: n.title, date: (p.starts_at as string).slice(0, 10), label: 'event' });
      else if (n.type === 'trip' && within(n.start_date ?? undefined)) upcoming.push({ id: n.id, type: n.type, title: n.title, date: n.start_date!, label: 'trip' });
      else if (n.type === 'application' && within(p.deadline as string)) upcoming.push({ id: n.id, type: n.type, title: n.title, date: p.deadline as string, label: 'deadline' });
      else if (n.type === 'job_posting' && within(p.deadline as string)) upcoming.push({ id: n.id, type: n.type, title: n.title, date: p.deadline as string, label: 'deadline' });
      // Anniversaries, a dated milestone whose month/day is today, in a past year.
      if (n.start_date && n.start_date.length >= 10 && n.start_date.slice(5, 10) === today.slice(5, 10) && n.start_date.slice(0, 4) < today.slice(0, 4)) {
        const years = Number(today.slice(0, 4)) - Number(n.start_date.slice(0, 4));
        upcoming.push({ id: n.id, type: n.type, title: n.title, date: today, label: `${years}y ago today` });
      }
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    // ── Setup progress (drives the getting-started checklist) ────────────────
    const setup = {
      self: nodes.some((n) => n.type === 'person' && (n.props as Record<string, unknown>).is_self === true),
      github: Boolean(githubToken()), // FR-004: the credential lives in the secret store

      people: peopleCount >= 1,
      interactions: (byType.interaction ?? 0) >= 1,
      atoms: atomsSnap.length >= 1,
      resume: resumesSnap.length >= 1,
    };
    const setupDone = Object.values(setup).filter(Boolean).length;

    // ── Insights ─────────────────────────────────────────────────────────────
    const habitsTotal = habits.length;
    const habitsDone = habits.filter((h) => h.checkedToday).length;
    const drifting = lane.filter((r) => r.status !== 'active').length;
    const relationshipsTotal = lane.length;
    const factorScores = {
      habits: habitsTotal > 0 ? habitsDone / habitsTotal : 1,
      reconnect: 1 - Math.min(drifting, 5) / 5,
      reminders: 1 - Math.min(reminders.length, 5) / 5,
      capture: recent.length > 0 ? 1 : 0,
    };
    const momentumScore = Math.round(
      (Object.keys(MOMENTUM_WEIGHTS) as Array<keyof typeof MOMENTUM_WEIGHTS>).reduce(
        (sum, k) => sum + factorScores[k] * MOMENTUM_WEIGHTS[k],
        0,
      ),
    );
    const factors = [
      { key: 'habits', label: 'Habits today', pct: Math.round(factorScores.habits * 100), weight: MOMENTUM_WEIGHTS.habits, detail: `${habitsDone}/${habitsTotal} done` },
      { key: 'reconnect', label: 'Relationship health', pct: Math.round(factorScores.reconnect * 100), weight: MOMENTUM_WEIGHTS.reconnect, detail: `${drifting} drifting` },
      { key: 'reminders', label: 'Reminder pressure', pct: Math.round(factorScores.reminders * 100), weight: MOMENTUM_WEIGHTS.reminders, detail: `${reminders.length} due` },
      { key: 'capture', label: 'Capture recency', pct: Math.round(factorScores.capture * 100), weight: MOMENTUM_WEIGHTS.capture, detail: recent.length > 0 ? 'active' : 'quiet' },
    ];
    const habitsLeft = habitsTotal - habitsDone;
    // Specific beats clever, and nothing in the product glows any more.
    let hint = 'Nothing outstanding.';
    if (habitsLeft > 0) hint = `${habitsLeft} habit${habitsLeft > 1 ? 's' : ''} to go today.`;
    else if (drifting > 0) hint = `${drifting} ${drifting > 1 ? 'people are' : 'person is'} drifting, reach out.`;
    else if (reminders.length > 0) hint = `${reminders.length} reminder${reminders.length > 1 ? 's' : ''} due.`;

    const skillIds = new Set(nodes.filter((n) => n.type === 'skill').map((n) => n.id));
    const coveredSkills = new Set<string>();
    for (const a of scorable) for (const s of a.skill_ids) if (skillIds.has(s)) coveredSkills.add(s);

    res.json({
      reminders,
      reconnect: lane.slice(0, 8),
      pipeline: applications.map((a) => ({ id: a.id, title: a.title, status: (a.props as Record<string, unknown>).status })),
      pipelineCounts,
      habits,
      recent,
      resumes: resumesSnap.length,
      focus: { tasks, goals },
      upcoming: upcoming.slice(0, 6),
      setup: { ...setup, done: setupDone, total: 6 },
      insights: {
        momentum: { score: momentumScore, hint, factors },
        funnel: pipelineCounts,
        relationships: { total: relationshipsTotal, healthy: relationshipsTotal - drifting, drifting },
        skills: { total: skillIds.size, covered: coveredSkills.size },
      },
      stats: { nodes: nodes.length, byType, mineByType },
      counts: {
        nodes: nodes.length,
        edges: edges.length,
        people: peopleCount,
        atoms: atomsSnap.length,
        /** Subject-bearing records that are the owner's, and the graph total. */
        myRecords: mineIds.size,
        allRecords: ownerIndex.ownerOf.size,
        unownedRecords: ownerIndex.unowned.length,
      },
    });
  }),
);
