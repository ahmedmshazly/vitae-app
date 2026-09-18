import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  EmptyState,
  EntityGlyph,
  ErrorState,
  FilterGroup,
  Mono,
  PageHeader,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../../lib/api.js';
import { isoDateIn, parseIsoDate, todayIso } from '../../lib/dates.js';
import { entityHref, entityListHref } from '../../lib/entity-href.js';

interface Reminder {
  id: string;
  note: string;
  due_on: string;
  subject_id?: string;
}
interface PlannerData {
  focus?: {
    tasks?: Array<{ id: string; title: string; due: string | null; priority: string | null }>;
  };
  upcoming?: Array<{ id: string; type: string; title: string; date: string; label: string }>;
}
type Category = 'reminders' | 'tasks' | 'dates';
type Filter = 'all' | Category;
interface PlannerItem {
  id: string;
  href?: string;
  type: string;
  title: string;
  date: string | null;
  invalidDate: boolean;
  meta: string;
  category: Category;
}
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'dates', label: 'Dates' },
] as const;

/** Validate without letting a single imported date crash the entire planner. */
function calendarDate(value: string | null | undefined): {
  date: string | null;
  invalidDate: boolean;
} {
  if (!value) return { date: null, invalidDate: false };
  try {
    const date = value.slice(0, 10);
    parseIsoDate(date);
    return { date, invalidDate: false };
  } catch {
    return { date: null, invalidDate: true };
  }
}

function toItems(data: PlannerData | undefined, reminders: Reminder[]): PlannerItem[] {
  return [
    ...reminders.map((item): PlannerItem => ({
      id: `reminder:${item.id}`,
      href: item.subject_id ? `/n/${item.subject_id}` : undefined,
      type: 'reminder',
      title: item.note || 'Untitled reminder',
      ...calendarDate(item.due_on),
      meta: 'Reminder',
      category: 'reminders',
    })),
    ...(data?.focus?.tasks ?? []).map((item): PlannerItem => ({
      id: `task:${item.id}`,
      href: entityHref('task', item.id),
      type: 'task',
      title: item.title,
      ...calendarDate(item.due),
      meta: item.priority ? `Task · ${item.priority} priority` : 'Task',
      category: 'tasks',
    })),
    ...(data?.upcoming ?? []).map((item): PlannerItem => ({
      id: `upcoming:${item.id}:${item.date}:${item.label}`,
      href: entityHref(item.type, item.id),
      type: item.type,
      title: item.title,
      ...calendarDate(item.date),
      meta: item.label,
      category: 'dates',
    })),
  ].sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31'));
}

function dayLabel(value: string | null, today: string): string {
  if (!value) return 'Unscheduled';
  if (value === today) return 'Today';
  if (value === isoDateIn(1)) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  }).format(parseIsoDate(value));
}

export function Planner() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('show');
  const filter: Filter = FILTERS.find((option) => option.key === selected)?.key ?? 'all';
  const query = useQuery({
    queryKey: ['dashboard', 'planner'],
    queryFn: () => api.get<PlannerData>('/dashboard'),
  });
  const reminders = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.get<{ reminders: Reminder[] }>('/reminders?due=all'),
  });
  const items = toItems(query.data, reminders.data?.reminders ?? []);
  const visible = items.filter((item) => filter === 'all' || item.category === filter);
  const groups = new Map<string, PlannerItem[]>();
  for (const item of visible) {
    const key = item.date ?? 'unscheduled';
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const today = todayIso();
  const loading = query.isLoading || reminders.isLoading;
  const hasError = query.isError || reminders.isError;
  const noData = !query.data && !reminders.data;
  const failed = [reminders.isError && 'reminders', query.isError && 'tasks and dates']
    .filter(Boolean)
    .join(' and ');
  const retry = () => {
    void Promise.all([query.refetch(), reminders.refetch()]);
  };
  function select(next: Filter) {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === 'all') updated.delete('show');
      else updated.set('show', next);
      return updated;
    });
  }

  return (
    <div className="page page--planner">
      <PageHeader
        title="Planner"
        subtitle="See what is due, what is next, and what still needs a date."
        actions={
          <Link className="vt-btn vt-btn--primary" to={entityListHref('task')}>
            View all tasks
          </Link>
        }
      />
      <p className="planner-scope">
        All open reminders, up to six open tasks, and up to six dates from the next 30 days. Snoozed
        reminders return when due. <Link to="/explore/timeline">Explore the full timeline</Link>.
      </p>
      <div className="planner-toolbar">
        <FilterGroup
          label="Show planner items"
          options={FILTERS}
          value={filter}
          onChange={select}
        />
        {!loading && (
          <Mono role="status">
            {visible.length} {visible.length === 1 ? 'item' : 'items'}
            {hasError ? ' · partial view' : ''}
          </Mono>
        )}
      </div>
      {loading && <SkeletonRows count={6} />}
      {!loading &&
        hasError &&
        (noData ? (
          <ErrorState
            title="Couldn't load the planner"
            detail="Your records have not been changed. Try loading the planner again."
            onRetry={retry}
            retrying={query.isFetching || reminders.isFetching}
          />
        ) : (
          <Banner tone="warning" title="This planner may be incomplete">
            <p>Couldn't refresh {failed}. Any previously loaded records remain visible.</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={retry}
              disabled={query.isFetching || reminders.isFetching}
            >
              Retry
            </Button>
          </Banner>
        ))}
      {!loading && !hasError && visible.length === 0 && (
        <EmptyState
          title={items.length === 0 ? 'No items in this planner' : 'No matching items'}
          detail={
            items.length === 0
              ? 'Add a dated reminder with Capture, or open Tasks to plan your next step.'
              : `No ${filter} in the current planner. Other item types are still available.`
          }
          action={
            items.length > 0 ? (
              <Button onClick={() => select('all')}>Show all items</Button>
            ) : (
              <Link to={entityListHref('task')}>Open tasks</Link>
            )
          }
        />
      )}
      {!loading && visible.length > 0 && (
        <div className="planner-ledger">
          {[...groups.entries()].map(([key, dayItems]) => {
            const date = dayItems[0].date;
            const overdue = date !== null && date < today;
            return (
              <section className="planner-day" key={key} aria-labelledby={`planner-day-${key}`}>
                <div className="planner-day__rail" aria-hidden>
                  <span>{date?.slice(8, 10) ?? '—'}</span>
                  <i />
                </div>
                <div className="planner-day__content">
                  <div className="planner-day__heading">
                    <h2 id={`planner-day-${key}`}>{dayLabel(date, today)}</h2>
                    {date && <time dateTime={date}>{date}</time>}
                    {overdue && <span className="planner-day__overdue">Overdue</span>}
                  </div>
                  <ul className="planner-day__items">
                    {dayItems.map((item) => {
                      const content = (
                        <>
                          <EntityGlyph
                            type={item.type}
                            glyph={item.category === 'reminders' ? 'bell' : undefined}
                            size="sm"
                          />
                          <span className="planner-item__body">
                            <span className="planner-item__title">{item.title}</span>
                            <span className="planner-item__meta">
                              {item.meta}
                              {item.invalidDate && ' · Date needs review'}
                            </span>
                          </span>
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {item.href ? (
                            <Link to={item.href} className="planner-item">
                              {content}
                            </Link>
                          ) : (
                            <div className="planner-item">{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
