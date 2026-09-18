import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Field, FilterGroup, Input, PageHeader } from '@vitae/ui';
import { isValidDateOnly, type TaskReadModel } from '@vitae/core';
import { api } from '../../lib/api.js';
import { entityHref } from '../../lib/entity-href.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { useProductivityWaiting } from './api.js';
import { todayDateOnly } from './model.js';
import { QueryPanel } from './QueryPanel.js';
import { useProductivityActions } from './use-productivity-actions.js';

interface NodePage {
  edges: Array<{ type: string; src: string; dst: string }>;
  neighbors: Record<string, { id: string; title: string; type?: string }>;
}
const FILTERS = [
  { key: 'all', label: 'All waiting' },
  { key: 'due', label: 'Follow up now' },
  { key: 'later', label: 'Later' },
  { key: 'undated', label: 'No date' },
];

export function WaitingScreen() {
  const list = useProductivityWaiting();
  const actions = useProductivityActions();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filter = params.get('followup') ?? 'all';
  const [limit, setLimit] = useState(20);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = Object.entries(drafts).some(
    ([id, value]) => value !== list.data?.tasks.find((task) => task.id === id)?.follow_up,
  );
  const guard = useUnsavedChanges(dirty || actions.isPending, { busy: actions.isPending });
  function setDraft(id: string, value: string | null) {
    setDrafts((previous) => {
      const next = { ...previous };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
  }
  const [today, setToday] = useState(todayDateOnly);
  useEffect(() => {
    const interval = window.setInterval(() => setToday(todayDateOnly()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  function setFilter(key: string, value: string) {
    setLimit(20);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key === 'q' },
    );
  }
  function clear() {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('q');
      next.delete('followup');
      return next;
    });
    setLimit(20);
  }
  // Optimistic/canonical writes can briefly retain completed rows in this
  // cached read model. Only waiting tasks belong in this workspace.
  const tasks = (list.data?.tasks ?? []).filter((task) => task.status === 'waiting');
  const filtered = Boolean(search || filter !== 'all');
  const matches = tasks
    .filter((task) => {
      if (!task.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      const dated = Boolean(task.follow_up && isValidDateOnly(task.follow_up));
      if (filter === 'all') return true;
      if (filter === 'due') return dated && task.follow_up! <= today;
      if (filter === 'later') return dated && task.follow_up! > today;
      if (filter === 'undated') return !dated;
      return false;
    })
    .sort(
      (a, b) =>
        (a.follow_up || '9999').localeCompare(b.follow_up || '9999') ||
        a.title.localeCompare(b.title),
    );

  return (
    <div className="page prod-page prod-waiting">
      <PageHeader
        title="Waiting"
        subtitle="Keep track of replies and the next time to check in."
        actions={
          <Link className="vt-btn" to="/today/tasks">
            Find a task
          </Link>
        }
      />
      {actions.writeLock && (
        <p className="prod-lock" role="status">
          {actions.writeLock}
        </p>
      )}
      {actions.error && (
        <Banner
          tone="warning"
          title={actions.conflict ? 'This task changed' : 'Follow-up was not confirmed'}
        >
          {actions.error.message} Your date is kept.{' '}
          <Button
            disabled={list.isFetching || actions.isPending}
            onClick={() => void list.refetch()}
          >
            Refresh waiting tasks
          </Button>
        </Banner>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="prod-waiting-tools">
        <Field label="Search waiting tasks" htmlFor="waiting-search">
          <Input
            id="waiting-search"
            type="search"
            placeholder="Find a task by title…"
            value={search}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </Field>
        <Button disabled={list.isFetching || actions.isPending} onClick={() => void list.refetch()}>
          {list.isFetching ? 'Refreshing…' : 'Refresh list'}
        </Button>
      </div>
      <FilterGroup
        label="Follow-up timing"
        value={filter}
        onChange={(value) => setFilter('followup', value)}
        options={FILTERS}
      />
      <div className="prod-waiting-count">
        <p className="prod-muted">
          {matches.length} matching · {tasks.length} waiting
        </p>
        {filtered && (
          <Button size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={matches.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading waiting items"
          errorTitle="Couldn't load waiting items"
          emptyTitle={filtered ? 'No matching waiting tasks' : 'Nothing is waiting'}
          emptyHint={
            filtered
              ? 'Try another title or follow-up filter.'
              : 'Choose Wait on a task to track a reply from a person or organization.'
          }
          emptyGlyph="bell"
          emptyAction={
            filtered ? (
              <Button onClick={clear}>Show all waiting tasks</Button>
            ) : (
              <Link to="/today/tasks" className="vt-btn">
                Go to Tasks
              </Link>
            )
          }
        >
          <ul className="prod-waiting-list">
            {matches.slice(0, limit).map((task) => (
              <WaitingRow
                key={task.id}
                task={task}
                today={today}
                actions={actions}
                draft={drafts[task.id]}
                onDraft={(value) => setDraft(task.id, value)}
                onNotice={setNotice}
              />
            ))}
          </ul>
          {matches.length > limit && (
            <Button className="prod-waiting-more" onClick={() => setLimit((value) => value + 20)}>
              Show more waiting tasks ({matches.length - limit} remaining)
            </Button>
          )}
        </QueryPanel>
      </div>
      {guard.prompt}
    </div>
  );
}

function WaitingRow({
  task,
  today,
  actions,
  draft,
  onDraft,
  onNotice,
}: {
  task: TaskReadModel;
  today: string;
  actions: ReturnType<typeof useProductivityActions>;
  draft?: string;
  onDraft: (value: string | null) => void;
  onNotice: (value: string | null) => void;
}) {
  // Each visible row has an independent lookup and recovery path. A failed
  // relationship request is never presented as an absent relationship.
  const relation = useQuery({
    queryKey: ['productivity', 'waiting-on', task.id],
    queryFn: () => api.get<NodePage>(`/nodes/${task.id}`),
    retry: false,
  });
  const edge = relation.data?.edges.find(
    (item) => item.type === 'WAITING_ON' && item.src === task.id,
  );
  const person = edge ? relation.data?.neighbors[edge.dst] : undefined;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const flight = useRef(false);
  const date =
    draft ?? (task.follow_up && isValidDateOnly(task.follow_up) ? task.follow_up : today);
  const due = task.follow_up && isValidDateOnly(task.follow_up) && task.follow_up <= today;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (flight.current || actions.locked || !isValidDateOnly(date)) return;
    flight.current = true;
    setSaving(true);
    onNotice(null);
    setFailed(false);
    try {
      const outcome = await actions.followUp(task, date);
      if (!outcome) {
        setFailed(true);
        return;
      }
      onDraft(null);
      onNotice(`Follow-up saved for ${date}: ${task.title}.`);
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  return (
    <li className="prod-waiting-row">
      <div className="prod-waiting-record">
        <Link className="prod-waiting-title" to={`/n/${task.id}`}>
          {task.title}
        </Link>
        <p className="prod-muted">
          {relation.isPending ? (
            'Loading who you’re waiting on…'
          ) : relation.isError ? (
            <>
              Couldn't load who you're waiting on.{' '}
              <Button size="sm" onClick={() => void relation.refetch()}>
                Retry contact
              </Button>
            </>
          ) : person && edge ? (
            <>
              Waiting on <Link to={entityHref(person.type ?? '', edge.dst)}>{person.title}</Link>
            </>
          ) : edge ? (
            'Waiting on an unavailable record.'
          ) : (
            'Waiting · No person or organization linked.'
          )}
        </p>
        <p className="prod-waiting-date">
          {task.follow_up ? (
            isValidDateOnly(task.follow_up) ? (
              <>
                <span>
                  {due ? (task.follow_up === today ? 'Due today' : 'Overdue') : 'Upcoming'}
                </span>{' '}
                · Follow-up <time dateTime={task.follow_up}>{task.follow_up}</time>
              </>
            ) : (
              'Follow-up date unavailable'
            )
          ) : (
            'No follow-up date'
          )}
        </p>
      </div>
      <form className="prod-waiting-form" onSubmit={(event) => void submit(event)}>
        <Field label="Follow-up date" htmlFor={`wait-follow-${task.id}`}>
          <Input
            id={`wait-follow-${task.id}`}
            aria-label={`Follow-up date for ${task.title}`}
            type="date"
            value={date}
            onChange={(event) => {
              onDraft(event.target.value);
              onNotice(null);
              setFailed(false);
            }}
            disabled={actions.locked || saving}
            required
          />
        </Field>
        <Button
          type="submit"
          disabled={actions.locked || saving || !isValidDateOnly(date) || date === task.follow_up}
        >
          {saving ? 'Saving…' : 'Set follow-up'}
        </Button>
        {failed && (
          <p role="alert">
            Not saved. Your date is kept above; refresh the list if the task changed, then try
            again.
          </p>
        )}
      </form>
    </li>
  );
}
