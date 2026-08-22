/**
 * Today, the agenda, not a dashboard.
 *
 * The screen answers one question: *what needs me now?* So the page is one
 * prioritised queue ("Needs you") that merges reminders, open tasks and near
 * deadlines by how overdue each is, then the two daily rituals (habits,
 * reconnect), then everything that is merely a number, under "How things
 * stand". Rank comes from order, type scale and rule lines: Quiet has no
 * accent hue to rank with, so eleven equal cards had no hierarchy at all.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useAnimationControls } from 'motion/react';
import {
  Button,
  ChargeRing,
  Chip,
  DotGrid,
  EmptyState,
  EntityGlyph,
  ErrorState,
  Glyph,
  InfoPopover,
  Mono,
  PageHeader,
  ProvenanceChip,
  RegisterRule,
  Section,
  SkeletonRows,
  type GlyphName,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { daysUntil, parseIsoDate, todayIso } from '../lib/dates.js';
import { staggered, useEmphasis, useEnterItem } from '../lib/motion.js';
import { useToast } from '../features/Toast.js';
import { InteractionLogger } from '../features/InteractionLogger.js';
import {
  GettingStarted,
  useGettingStartedDismissed,
  type SetupState,
} from '../features/GettingStarted.js';
import { entityHref } from '../lib/entity-href.js';

interface MomentumFactor {
  key: string;
  label: string;
  pct: number;
  weight: number;
  detail: string;
}

interface Dashboard {
  reminders: Array<{ id: string; note: string; due_on: string; subject_id: string }>;
  reconnect: Array<{
    person: { id: string; title: string; props?: Record<string, unknown> };
    priority: number;
    status: string;
    daysSinceLast: number | null;
  }>;
  pipeline: Array<{ id: string; title: string; status: string }>;
  pipelineCounts: Record<string, number>;
  habits: Array<{
    id: string;
    title: string;
    streak: number;
    grid: boolean[];
    checkedToday: boolean;
  }>;
  recent: Array<{ id: string; type: string; title: string; source: string }>;
  resumes: number;
  focus: {
    tasks: Array<{
      id: string;
      title: string;
      due: string | null;
      priority: string | null;
      status: string;
    }>;
    goals: Array<{ id: string; title: string; progress: number; keyResults: number }>;
  };
  upcoming: Array<{ id: string; type: string; title: string; date: string; label: string }>;
  setup: SetupState;
  insights: {
    momentum: { score: number; hint: string; factors: MomentumFactor[] };
    funnel: Record<string, number>;
    relationships: { total: number; healthy: number; drifting: number };
    skills: { total: number; covered: number };
  };
  stats: { nodes: number; byType: Record<string, number> };
  counts: { nodes: number; edges: number; people: number; atoms: number };
}

/**
 * The shared row shape: 36px minimum, hairline-separated, highlighted on hover
 * by ground rather than by underline, a row is several elements wide and
 * underlining all of them (title, date, chip) reads as damage. The negative
 * margin lets the highlight breathe past the text without indenting the list.
 */
const ROW = 'flex min-h-9 items-center gap-3 border-b border-hairline py-2 last:border-b-0';
const ROW_LINK = `${ROW} -mx-2 px-2 rounded-sm text-ink no-underline hover:bg-raised hover:no-underline`;

const PIPELINE_ORDER = ['applied', 'screening', 'interview', 'offer'];
/** A deadline further out than this is horizon, not agenda. */
const DEADLINE_HORIZON_DAYS = 7;
/** Streaks are the one place the ember tone is allowed, and only once earned. */
const STREAK_THRESHOLD = 3;

// ── The queue ────────────────────────────────────────────────────────────────

interface QueueItem {
  key: string;
  /** Node type for the glyph tile; `glyph` overrides it for non-node rows. */
  type: string;
  glyph?: GlyphName;
  kind: string;
  title: string;
  href: string;
  /** Days past due; negative is still ahead. This is the sort key. */
  overdueBy: number;
  /** The status in words, never a colour on its own. */
  when: string;
  reminderId?: string;
}

/** "3d overdue" · "due today" · "in 2d", largest useful unit, no cleverness. */
function dueLabel(days: number): string {
  if (days > 0) return `${days}d overdue`;
  if (days === 0) return 'due today';
  return `in ${-days}d`;
}

/**
 * Everything with a claim on today, in one list ordered by how late it is.
 * Reminders and tasks carry real due dates; a deadline only joins once it is
 * inside the horizon, so an application due in five weeks doesn't read as a
 * demand. Anniversaries and trips stay out entirely, they are not asks.
 */
export function buildQueue(data: Dashboard): QueueItem[] {
  const items: QueueItem[] = [];

  for (const r of data.reminders) {
    const late = -daysUntil(r.due_on);
    items.push({
      key: `reminder:${r.id}`,
      type: 'reminder',
      glyph: 'bell',
      kind: 'Reminder',
      title: r.note,
      href: `/n/${r.subject_id}`,
      overdueBy: late,
      when: dueLabel(late),
      reminderId: r.id,
    });
  }

  for (const t of data.focus.tasks) {
    // An undated task is work in hand, not work that is late: it sorts below
    // everything overdue but above anything still ahead.
    items.push({
      key: `task:${t.id}`,
      type: 'task',
      kind: 'Task',
      title: t.title,
      href: `/n/${t.id}`,
      overdueBy: t.due ? -daysUntil(t.due) : 0,
      when: t.due ? dueLabel(-daysUntil(t.due)) : 'no date',
    });
  }

  for (const u of data.upcoming) {
    if (u.label !== 'deadline') continue;
    const late = -daysUntil(u.date);
    if (late < -DEADLINE_HORIZON_DAYS) continue;
    items.push({
      key: `deadline:${u.id}`,
      type: u.type,
      kind: 'Deadline',
      title: u.title,
      href: `/n/${u.id}`,
      overdueBy: late,
      when: dueLabel(late),
    });
  }

  return items.sort((a, b) => b.overdueBy - a.overdueBy || a.title.localeCompare(b.title));
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Ticks for the register rule: one per weekday, active = today. The rule is
 * structural, so it has to encode something true, where in the week you are
 * is the one thing a screen called Today can honestly claim.
 */
export function weekTicks(iso: string): {
  ticks: Array<{ at: number; label: string }>;
  index: number;
} {
  // getDay() is Sunday-first; the rule reads Monday-first, like a calendar.
  const index = (parseIsoDate(iso).getDay() + 6) % 7;
  // Centre of each day's slot, not the boundary between them, a tick at 100%
  // would sit past the end of the rule with nothing under it.
  return {
    ticks: WEEKDAYS.map((label, i) => ({ at: (i + 0.5) / WEEKDAYS.length, label })),
    index,
  };
}

// ── Screen ───────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
  });
  const [logTarget, setLogTarget] = useState<{ id: string; name: string } | null>(null);
  const [dismissedInit, persistDismiss] = useGettingStartedDismissed();
  const [gsDismissed, setGsDismissed] = useState(dismissedInit);
  const dismissGs = () => {
    persistDismiss();
    setGsDismissed(true);
  };
  const qc = useQueryClient();
  const { flash } = useToast();
  const today = todayIso();
  const week = useMemo(() => weekTicks(today), [today]);

  const toggleHabit = useMutation({
    mutationFn: (habitId: string) => api.post(`/habits/${habitId}/toggle`, {}),
    // Optimistic: flip today's check instantly, roll back on error.
    onMutate: async (habitId: string) => {
      await qc.cancelQueries({ queryKey: ['dashboard'] });
      const prev = qc.getQueryData<Dashboard>(['dashboard']);
      if (prev) {
        qc.setQueryData<Dashboard>(['dashboard'], {
          ...prev,
          habits: prev.habits.map((h) =>
            h.id === habitId
              ? {
                  ...h,
                  checkedToday: !h.checkedToday,
                  grid: [...h.grid.slice(0, -1), !h.checkedToday],
                }
              : h,
          ),
        });
      }
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['dashboard'], ctx.prev);
      // The tick sliding back is a change, not an explanation. Owning an
      // onError opts this mutation out of the app's error toast, so say why
      // here or the failure passes as a misclick.
      flash(err instanceof Error ? err.message : 'That habit could not be marked.', {
        variant: 'error',
      });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const completeReminder = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/done`, {}),
    onSuccess: (_result, id) => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      // Undo is a real reopen call, not a client-side rewind.
      flash('Done', {
        undo: async () => {
          await api.post(`/reminders/${id}/reopen`, {});
          void qc.invalidateQueries({ queryKey: ['dashboard'] });
          void qc.invalidateQueries({ queryKey: ['reminders'] });
        },
      });
    },
  });

  if (isError) {
    return (
      <div className="page">
        <PageHeader title="Today" />
        <RegisterRule />
        <ErrorState
          title="Couldn’t load today"
          detail={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title="Today" subtitle="Loading your agenda…" />
        <RegisterRule />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  const queue = buildQueue(data);
  // The authoritative count: `reconnect` is only the top 8 of the lane, so
  // counting it here would disagree with the relationship-health bar below.
  const drifting = data.insights.relationships.drifting;

  return (
    <div className="page">
      <PageHeader
        title="Today"
        subtitle={
          <>
            <Mono className="text-faint">{today}</Mono>
            {' · '}
            {queue.length > 0
              ? `${queue.length} ${queue.length === 1 ? 'thing needs' : 'things need'} you`
              : 'Nothing needs you'}
            {drifting > 0 && ` · ${drifting} drifting`}
          </>
        }
        actions={
          <div className="hstack">
            <Link className="planner__back" to="/today/planner">
              Planner
            </Link>
            <Momentum momentum={data.insights.momentum} />
          </div>
        }
      />
      <RegisterRule ticks={week.ticks} activeIndex={week.index} label="Days of this week" />

      {!gsDismissed && data.setup.done < data.setup.total && (
        <GettingStarted setup={data.setup} onDismiss={dismissGs} />
      )}

      <Section title="Needs you" meta={queue.length}>
        {queue.length === 0 ? (
          <EmptyState
            glyph="check"
            title="Nothing needs you today"
            hint="Reminders, open tasks and deadlines inside the next week land here. Press ⌘K to capture one."
          />
        ) : (
          <ul className="flex list-none flex-col p-0">
            {staggered(queue).map(({ item, index }) => (
              <QueueRow
                key={item.key}
                item={item}
                index={index}
                pending={completeReminder.isPending}
                onDone={() => completeReminder.mutate(item.reminderId!)}
              />
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Habits" meta={data.habits.length}>
          {data.habits.length === 0 ? (
            <EmptyState
              glyph="habit"
              title="No habits tracked"
              hint={
                <>
                  Capture one with ⌘K: <Mono>habit Writing</Mono>.
                </>
              }
            />
          ) : (
            data.habits.map((h) => (
              <HabitRow
                key={h.id}
                habit={h}
                onToggle={() => {
                  const wasChecked = h.checkedToday;
                  toggleHabit.mutate(h.id, {
                    onSuccess: () =>
                      // The button says Check; the toast says Checked.
                      flash(wasChecked ? 'Unchecked' : 'Checked', {
                        undo: () => toggleHabit.mutate(h.id),
                      }),
                  });
                }}
              />
            ))
          )}
        </Section>

        <Section title="Reconnect" meta={data.reconnect.length}>
          {data.reconnect.length === 0 ? (
            <EmptyState
              glyph="person"
              title="No one is drifting"
              hint="Log an interaction on a person to start tracking cadence."
            />
          ) : (
            data.reconnect.map((r) => (
              <ReconnectRow
                key={r.person.id}
                entry={r}
                onLog={() => setLogTarget({ id: r.person.id, name: r.person.title })}
              />
            ))
          )}
        </Section>
      </div>

      <HowThingsStand data={data} />

      {logTarget && (
        <InteractionLogger
          personId={logTarget.id}
          personName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/**
 * One row of the queue. Its own component rather than JSX inside `.map()`,
 * because `useEnterItem` is a hook and a hook cannot be called from a loop
 * body. `staggered()` hands it the already-capped index, so the sixth row
 * onward arrives with the fifth.
 */
function QueueRow({
  item,
  index,
  pending,
  onDone,
}: {
  item: QueueItem;
  index: number;
  pending: boolean;
  onDone: () => void;
}) {
  return (
    <motion.li
      {...useEnterItem(index)}
      className="flex items-center gap-3 border-b border-hairline last:border-b-0"
    >
      <Link to={item.href} className={`${ROW_LINK} flex-1 border-b-0`}>
        <EntityGlyph type={item.type} glyph={item.glyph} title={item.kind} size="sm" />
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <Mono className={item.overdueBy > 0 ? 'text-sm text-warning' : 'text-sm text-muted'}>
          {item.when}
        </Mono>
      </Link>
      {item.reminderId && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Done
        </Button>
      )}
    </motion.li>
  );
}

/**
 * A 0-1 bar. Achromatic: magnitude is length, and the number is always printed
 * beside it, so nothing here depends on colour.
 */
function Bar({ value, label, decorative }: { value: number; label: string; decorative?: boolean }) {
  const clamped = Math.max(0, Math.min(1, value));
  const percent = Math.round(clamped * 100);
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-raised"
      // Inside a link whose text already prints the percentage, the meter's
      // value is folded into the link's accessible name and read twice
      // ("… 31% 31%"). Where it is the only statement of the value it stays a
      // real progressbar.
      role={decorative ? undefined : 'progressbar'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      aria-valuenow={decorative ? undefined : percent}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : 100}
      aria-valuetext={decorative ? undefined : `${percent}%`}
    >
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

/**
 * Momentum as data: a mono number with its breakdown one click away. The gauge
 * it replaces swept a gradient arc on every mount, which reported nothing:
 * the score had not changed, the component had merely rendered.
 */
function Momentum({ momentum }: { momentum: Dashboard['insights']['momentum'] }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-xs tracking-[0.08em] text-muted uppercase">Momentum</div>
        <div className="text-sm text-muted">{momentum.hint}</div>
      </div>
      <Mono className="text-xl text-ink-strong">{momentum.score}</Mono>
      <InfoPopover title="What drives momentum" triggerLabel="breakdown">
        <p>
          A transparent 0-100 read on whether the system is being worked. Each factor contributes
          its weight:
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {momentum.factors.map((f) => (
            <div key={f.key} className="grid gap-1">
              <span className="text-sm text-ink-soft">
                {f.label} <Mono className="text-faint">·{f.weight}</Mono>
              </span>
              <Bar value={f.pct / 100} label={`${f.label} momentum`} />
              <Mono className="text-xs text-faint">{f.detail}</Mono>
            </div>
          ))}
        </div>
      </InfoPopover>
    </div>
  );
}

function HabitRow({
  habit,
  onToggle,
}: {
  habit: Dashboard['habits'][number];
  onToggle: () => void;
}) {
  // Driven imperatively rather than by a key change: remounting the row to
  // replay the animation would drop keyboard focus off the button that was
  // just pressed.
  const controls = useAnimationControls();
  const pulse = useEmphasis();
  const grid = habit.grid.slice(-14);
  return (
    <motion.div className={ROW} variants={pulse} animate={controls}>
      <button
        type="button"
        aria-pressed={habit.checkedToday}
        aria-label={
          habit.checkedToday ? `Uncheck ${habit.title} for today` : `Check ${habit.title} for today`
        }
        onClick={() => {
          void controls.start('animate');
          onToggle();
        }}
        className={[
          'flex size-8 flex-none items-center justify-center rounded-sm border border-control',
          habit.checkedToday ? 'bg-accent text-accent-ink' : 'text-faint hover:text-ink',
        ].join(' ')}
      >
        <Glyph name="check" size={14} />
      </button>
      <span className="min-w-0 flex-1 truncate text-ink">{habit.title}</span>
      <DotGrid days={grid} label={`${habit.title}, last 14 days`} recentWindow={grid.length} />
      <Mono
        className={habit.streak >= STREAK_THRESHOLD ? 'text-sm text-ember' : 'text-sm text-muted'}
      >
        {habit.streak}d streak
      </Mono>
    </motion.div>
  );
}

function ReconnectRow({
  entry,
  onLog,
}: {
  entry: Dashboard['reconnect'][number];
  onLog: () => void;
}) {
  const quiet = entry.daysSinceLast != null ? Math.round(entry.daysSinceLast) : null;
  const cadence = Number(
    (entry.person.props as Record<string, unknown> | undefined)?.cadence_target_days ?? 60,
  );
  const over = quiet != null && quiet > cadence;
  return (
    <div className={ROW}>
      <ChargeRing quiet={quiet ?? cadence * 2} cadence={cadence} size={24} />
      <Link
        to={`/network/people/${entry.person.id}`}
        className="min-w-0 flex-1 truncate text-ink no-underline hover:underline"
      >
        {entry.person.title}
      </Link>
      <Mono className={over ? 'text-sm text-warning' : 'text-sm text-muted'}>
        {quiet != null ? `${quiet}d quiet` : 'never logged'}
      </Mono>
      <Button size="sm" variant="ghost" onClick={onLog}>
        Log
      </Button>
    </div>
  );
}

/** The reference tier: how things stand, as opposed to what needs doing. */
function HowThingsStand({ data }: { data: Dashboard }) {
  const { relationships, skills } = data.insights;
  const skillPct = skills.total > 0 ? skills.covered / skills.total : 0;
  const relPct = relationships.total > 0 ? relationships.healthy / relationships.total : 0;
  const ledger: Array<[number, string]> = [
    [data.counts.nodes, 'records'],
    [data.counts.edges, 'connections'],
    [data.counts.people, 'people'],
    [data.counts.atoms, 'atoms'],
  ];

  return (
    <Section title="How things stand">
      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-hairline py-3">
        {ledger.map(([value, label]) => (
          <p key={label} className="flex items-baseline gap-2">
            <Mono className="text-xl text-ink-strong">{value}</Mono>
            <span className="text-xs tracking-[0.06em] text-muted uppercase">{label}</span>
          </p>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm text-muted">Applications</h3>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {PIPELINE_ORDER.map((stage) => {
              const count = data.pipelineCounts?.[stage] ?? 0;
              return (
                <p
                  key={stage}
                  className="flex flex-col items-center gap-1 rounded-sm border border-hairline p-3"
                >
                  <Mono className={count > 0 ? 'text-lg text-ink-strong' : 'text-lg text-faint'}>
                    {count}
                  </Mono>
                  <span className="text-xs text-muted">{stage}</span>
                </p>
              );
            })}
          </div>
          {data.pipeline.length === 0 ? (
            <p className="text-sm text-muted">No applications yet.</p>
          ) : (
            data.pipeline.slice(0, 4).map((a) => (
              <Link key={a.id} to={`/career/applications/${a.id}`} className={ROW_LINK}>
                <EntityGlyph type="application" size="sm" />
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <Chip mono>{a.status}</Chip>
              </Link>
            ))
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-sm text-muted">Goals</h3>
            {data.focus.goals.length === 0 ? (
              <p className="text-sm text-muted">
                No active goals. Set one with a few key results to track progress.
              </p>
            ) : (
              data.focus.goals.map((g) => (
                <Link
                  key={g.id}
                  to={`/n/${g.id}`}
                  className="-mx-2 block rounded-sm px-2 py-2 text-ink no-underline hover:bg-raised hover:no-underline"
                >
                  <span className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{g.title}</span>
                    <Mono className="text-sm text-faint">{Math.round(g.progress * 100)}%</Mono>
                  </span>
                  <Bar value={g.progress} label={`${g.title} progress`} decorative />
                </Link>
              ))
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <span className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">Relationship health</span>
                <Mono className="text-sm text-faint">
                  {relationships.healthy}/{relationships.total} healthy
                </Mono>
              </span>
              <Bar value={relPct} label="Relationship health" />
            </div>
            <div>
              <span className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">Skill coverage on résumé</span>
                <Mono className="text-sm text-faint">
                  {skills.covered}/{skills.total} used
                </Mono>
              </span>
              <Bar value={skillPct} label="Résumé skill coverage" />
            </div>
          </div>
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-sm text-muted">Recent captures</h3>
      {data.recent.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing captured yet. Press ⌘K to add your first record.
        </p>
      ) : (
        data.recent.map((n) => (
          <Link key={n.id} to={entityHref(n.type, n.id)} className={ROW_LINK}>
            <EntityGlyph type={n.type} size="sm" />
            <span className="min-w-0 flex-1 truncate">{n.title}</span>
            <ProvenanceChip source={n.source} />
          </Link>
        ))
      )}
    </Section>
  );
}
