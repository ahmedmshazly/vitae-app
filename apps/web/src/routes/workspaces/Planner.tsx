import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  EmptyState,
  EntityGlyph,
  ErrorState,
  Mono,
  PageHeader,
  RegisterRule,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../../lib/api.js';

interface PlannerData {
  reminders: Array<{ id: string; note: string; due_on: string; subject_id: string }>;
  focus: {
    tasks: Array<{
      id: string;
      title: string;
      due: string | null;
      priority: string | null;
      status: string;
    }>;
  };
  upcoming: Array<{ id: string; type: string; title: string; date: string; label: string }>;
}

interface PlannerItem {
  id: string;
  href: string;
  type: string;
  title: string;
  date: string | null;
  meta: string;
}

function toItems(data: PlannerData): PlannerItem[] {
  return [
    ...data.reminders.map((item) => ({
      id: `reminder:${item.id}`,
      href: `/n/${item.subject_id}`,
      type: 'interaction',
      title: item.note,
      date: item.due_on,
      meta: 'Reminder',
    })),
    ...data.focus.tasks.map((item) => ({
      id: `task:${item.id}`,
      href: `/n/${item.id}`,
      type: 'task',
      title: item.title,
      date: item.due,
      meta: item.priority ? `${item.priority} priority` : 'Task',
    })),
    ...data.upcoming.map((item) => ({
      id: `upcoming:${item.id}`,
      href: `/n/${item.id}`,
      type: item.type,
      title: item.title,
      date: item.date,
      meta: item.label,
    })),
  ].sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31'));
}

function dayLabel(value: string | null): string {
  if (!value) return 'Unscheduled';
  const today = new Date();
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return 'Today';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function Planner() {
  const query = useQuery({
    queryKey: ['dashboard', 'planner'],
    queryFn: () => api.get<PlannerData>('/dashboard'),
  });

  const items = query.data ? toItems(query.data) : [];
  const groups = new Map<string, PlannerItem[]>();
  for (const item of items) {
    const key = dayLabel(item.date);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="page page--planner">
      <div className="workspace-home__eyebrow">Today · extended horizon</div>
      <PageHeader
        title="Planner"
        subtitle="Reminders, tasks, and dated evidence on one honest timeline."
        actions={
          <Link className="planner__back" to="/today">
            Return to Today
          </Link>
        }
      />
      <RegisterRule />

      {query.isLoading && <SkeletonRows count={6} />}
      {query.isError && (
        <ErrorState
          title="Couldn’t load the planner"
          detail={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      )}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          title="The horizon is clear"
          detail="New reminders, tasks, and dated records will gather here."
        />
      )}

      {items.length > 0 && (
        <div className="planner-ledger">
          {[...groups.entries()].map(([day, dayItems], groupIndex) => (
            <section
              className="planner-day"
              key={day}
              aria-labelledby={`planner-day-${groupIndex}`}
            >
              <div className="planner-day__rail">
                <span>{String(groupIndex + 1).padStart(2, '0')}</span>
                <i aria-hidden />
              </div>
              <div className="planner-day__content">
                <h2 id={`planner-day-${groupIndex}`}>{day}</h2>
                <div className="planner-day__items">
                  {dayItems.map((item) => (
                    <Link to={item.href} className="planner-item" key={item.id}>
                      <EntityGlyph type={item.type} size="sm" />
                      <span className="planner-item__title">{item.title}</span>
                      <span className="planner-item__meta">{item.meta}</span>
                      <Mono>{item.date?.slice(0, 10) ?? 'Open'}</Mono>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
