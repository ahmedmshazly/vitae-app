import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Field, Input, Sheet, Textarea } from '@vitae/ui';
import {
  parseRRule,
  type Importance,
  type Recurrence,
  type TaskReadModel,
  type VitaePriority,
} from '@vitae/core';
import { api, ApiError } from '../../lib/api.js';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { revisionFromResult, useProductivityTimeEntries } from './api.js';
import { STATUS_LABEL, visibleTimeEntries } from './model.js';
import type { useProductivityActions } from './use-productivity-actions.js';

interface EdgeLite {
  id: string;
  type: string;
  src: string;
  dst: string;
}
interface NodePage {
  node: { id: string; props?: Record<string, unknown> };
  edges: EdgeLite[];
  neighbors: Record<string, { id: string; title: string }>;
}
function fields(task: TaskReadModel | null) {
  return {
    title: task?.title ?? '',
    due: task?.due ?? '',
    target: task?.target ?? '',
    follow_up: task?.follow_up ?? '',
    priority: task?.priority ?? '',
    importance: task?.importance ?? '',
  };
}
function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export interface TaskDetailProps {
  task: TaskReadModel | null;
  projectTitle?: string;
  locked: boolean;
  actions: ReturnType<typeof useProductivityActions>;
  onClose: () => void;
}

/** Keyed by task ID. Cache refreshes must never replace a draft. */
export function TaskDetail({ task, projectTitle, locked, actions, onClose }: TaskDetailProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => fields(task));
  const [baseline, setBaseline] = useState(() => fields(task));
  const [revision, setRevision] = useState(task?.rev ?? 0);
  const [recurrence, setRecurrence] = useState({ rrule: '', mode: 'fixed' });
  const [storedRecurrence, setStoredRecurrence] = useState({ rrule: '', mode: 'fixed' });
  const exceptions = useRef<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dependency, setDependency] = useState<PickedEntity | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const flight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailKey = ['productivity', 'inspector', task?.id];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get<NodePage>(`/nodes/${task!.id}`),
    enabled: Boolean(task),
    retry: false,
  });
  const entries = useProductivityTimeEntries(task?.id);
  useEffect(() => {
    if (!detail.data || detail.isFetching || hydrated) return;
    const stored = detail.data.node.props?.recurrence as Recurrence | undefined;
    const next = {
      rrule: stored?.rrule ?? '',
      mode: stored?.mode === 'from_completion' ? 'from_completion' : 'fixed',
    };
    setRecurrence(next);
    setStoredRecurrence(next);
    exceptions.current = stored?.exceptions ?? [];
    setHydrated(true);
  }, [detail.data, detail.isFetching, hydrated]);

  const depends = (detail.data?.edges ?? []).filter(
    (edge) => edge.type === 'DEPENDS_ON' && edge.src === task?.id,
  );
  const listed = visibleTimeEntries(entries.data?.time_entries ?? []);
  const openEntry = listed.find((entry) => !entry.ended_at);
  const fieldsDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const recurrenceDirty = JSON.stringify(recurrence) !== JSON.stringify(storedRecurrence);
  const disabled = locked || Boolean(busy);
  const guard = useUnsavedChanges(
    Boolean(task) && (fieldsDirty || recurrenceDirty || Boolean(dependency) || Boolean(busy)),
    {
      busy: Boolean(busy),
      onClose: () => {
        const id = task?.id;
        onClose();
        window.setTimeout(() => document.getElementById(`prod-open-task-${id}`)?.focus(), 0);
      },
    },
  );
  function change(key: keyof typeof draft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setNotice(null);
  }
  async function perform(label: string, work: () => Promise<void>) {
    if (flight.current || locked) return;
    flight.current = true;
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The change could not be saved. Try again.',
      );
    } finally {
      flight.current = false;
      setBusy(null);
    }
  }
  async function save() {
    if (!task) return;
    if (!draft.title.trim()) {
      setError('Give this task a title before saving.');
      document.getElementById('prod-title')?.focus();
      return;
    }
    const cleared = (['due', 'target', 'follow_up', 'priority', 'importance'] as const).filter(
      (key) => baseline[key] && !draft[key],
    );
    if (cleared.length) {
      setError(
        'This task editor cannot clear stored dates, priority or importance yet. Restore those values before saving other changes.',
      );
      return;
    }
    const rrule = recurrence.rrule.trim();
    if (recurrenceDirty && rrule && !parseRRule(rrule)) {
      setError(
        'Enter a supported recurrence rule, for example FREQ=WEEKLY;BYDAY=MO, or leave it blank to stop repeating.',
      );
      return;
    }
    await perform('save', async () => {
      let savedFields = false;
      let savedRevision = revision;
      if (fieldsDirty) {
        const outcome = await actions.update(
          { ...task, rev: savedRevision },
          {
            title: draft.title.trim(),
            due: draft.due || undefined,
            target: draft.target || undefined,
            follow_up: draft.follow_up || undefined,
            priority: (draft.priority || undefined) as VitaePriority | undefined,
            importance: (draft.importance || undefined) as Importance | undefined,
          },
        );
        if (!outcome) return;
        savedRevision = revisionFromResult(outcome.result) ?? savedRevision;
        setRevision(savedRevision);
        const saved = { ...draft, title: draft.title.trim() };
        setDraft(saved);
        setBaseline(saved);
        savedFields = true;
      }
      if (recurrenceDirty) {
        if (!hydrated) {
          setError('Task details must load before recurrence can be saved.');
          return;
        }
        const outcome = await actions.setRecurrence(
          task,
          rrule
            ? {
                rrule,
                mode: recurrence.mode === 'from_completion' ? 'from_completion' : 'fixed',
                exceptions: exceptions.current,
              }
            : null,
          savedRevision,
        );
        if (!outcome) {
          if (savedFields)
            setNotice('Task details saved. Recurrence is still unsaved; your rule is kept below.');
          return;
        }
        setRevision(revisionFromResult(outcome.result) ?? savedRevision);
        setStoredRecurrence({ ...recurrence, rrule });
        setRecurrence({ ...recurrence, rrule });
        qc.setQueryData<NodePage>(detailKey, (previous) =>
          previous
            ? {
                ...previous,
                node: {
                  ...previous.node,
                  props: {
                    ...previous.node.props,
                    recurrence: rrule
                      ? { rrule, mode: recurrence.mode, exceptions: exceptions.current }
                      : undefined,
                  },
                },
              }
            : previous,
        );
      }
      setNotice('Task saved.');
    });
  }
  async function addDependency() {
    if (!task || !dependency) return;
    await perform('dependency', async () => {
      const created = await api.post<{ edge: EdgeLite }>('/edges', {
        type: 'DEPENDS_ON',
        src: task.id,
        dst: dependency.id,
      });
      qc.setQueryData<NodePage>(detailKey, (previous) =>
        previous
          ? {
              ...previous,
              edges: [...previous.edges, created.edge],
              neighbors: { ...previous.neighbors, [dependency.id]: dependency },
            }
          : previous,
      );
      setDependency(null);
      setNotice('Dependency added.');
    });
  }
  async function removeDependency(edgeId: string) {
    await perform('dependency', async () => {
      try {
        await api.del(`/edges/${edgeId}`);
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      }
      qc.setQueryData<NodePage>(detailKey, (previous) =>
        previous
          ? { ...previous, edges: previous.edges.filter((edge) => edge.id !== edgeId) }
          : previous,
      );
      setNotice('Dependency removed.');
    });
  }
  async function toggleTimer() {
    if (!task || entries.isFetching || entries.isError) return;
    await perform('timer', async () => {
      const outcome = openEntry
        ? await actions.updateTimeEntry(openEntry.id, new Date().toISOString())
        : await actions.addTimeEntry(task.id, new Date().toISOString());
      if (outcome) setNotice(openEntry ? 'Focus session saved.' : 'Focus session started.');
    });
  }
  return (
    <>
      <Sheet
        open={task != null}
        onOpenChange={guard.onOpenChange}
        title={task?.title ?? 'Task'}
        wide
        footer={
          <>
            <Button onClick={guard.requestClose}>Close</Button>
            <Button
              variant="primary"
              disabled={disabled || (!fieldsDirty && !recurrenceDirty)}
              onClick={() => void save()}
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="prod-inspector">
          <p className="prod-detail-context">
            {task ? STATUS_LABEL[task.status] : ''}
            {projectTitle ? ` · ${projectTitle}` : ''} ·{' '}
            <Link to={`/n/${task?.id}`}>Open full record</Link>
          </p>
          {task && task.rev !== revision && !actions.isPending && !busy && (
            <Banner tone="warning" title="This task changed">
              Your draft is preserved. Close and reopen the task to load its latest saved revision.
            </Banner>
          )}
          {(error || actions.error) && (
            <p className="prod-form-error" role="alert">
              {error ?? actions.error?.message}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <fieldset disabled={disabled} className="prod-detail-section">
            <legend>Task details</legend>
            <Field label="Title" htmlFor="prod-title">
              <Textarea
                id="prod-title"
                rows={3}
                value={draft.title}
                maxLength={500}
                required
                onChange={(event) => change('title', event.target.value)}
              />
            </Field>
            <div className="prod-detail-grid">
              <Field label="Due" htmlFor="prod-due" help="The deadline.">
                <Input
                  id="prod-due"
                  type="date"
                  value={draft.due}
                  onChange={(event) => change('due', event.target.value)}
                />
              </Field>
              <Field label="Target" htmlFor="prod-target" help="When you aim to work on it.">
                <Input
                  id="prod-target"
                  type="date"
                  value={draft.target}
                  onChange={(event) => change('target', event.target.value)}
                />
              </Field>
              <Field label="Follow-up" htmlFor="prod-follow" help="When to check back.">
                <Input
                  id="prod-follow"
                  type="date"
                  value={draft.follow_up}
                  onChange={(event) => change('follow_up', event.target.value)}
                />
              </Field>
              <Field label="Priority" htmlFor="prod-priority">
                <select
                  id="prod-priority"
                  className="vt-inp"
                  value={draft.priority}
                  onChange={(event) => change('priority', event.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="p1">P1 · Highest</option>
                  <option value="p2">P2 · High</option>
                  <option value="p3">P3 · Normal</option>
                  <option value="p4">P4 · Low</option>
                </select>
              </Field>
              <Field label="Importance" htmlFor="prod-importance">
                <select
                  id="prod-importance"
                  className="vt-inp"
                  value={draft.importance}
                  onChange={(event) => change('importance', event.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="none">None</option>
                  <option value="important">Important</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </div>
          </fieldset>
          <fieldset
            disabled={disabled || !hydrated || detail.isError}
            className="prod-detail-section"
          >
            <legend>Repeat</legend>
            <p className="prod-muted">
              Stores a repeat rule for this task. Completing it does not automatically create the
              next occurrence.
            </p>
            <Field
              label="Recurrence (rrule)"
              htmlFor="prod-rrule"
              help="For example FREQ=WEEKLY;BYDAY=MO. Clear the rule to stop repeating."
            >
              <Input
                id="prod-rrule"
                value={recurrence.rrule}
                placeholder="Does not repeat"
                onChange={(event) =>
                  setRecurrence((previous) => ({ ...previous, rrule: event.target.value }))
                }
              />
            </Field>
            <Field label="Recurrence mode" htmlFor="prod-mode">
              <select
                id="prod-mode"
                className="vt-inp"
                value={recurrence.mode}
                onChange={(event) =>
                  setRecurrence((previous) => ({ ...previous, mode: event.target.value }))
                }
              >
                <option value="fixed">Fixed schedule</option>
                <option value="from_completion">From completion date</option>
              </select>
            </Field>
          </fieldset>
          {detail.isPending && task && <p role="status">Loading recurrence and dependencies…</p>}
          {detail.isError && (
            <p role="alert">
              Couldn't load recurrence and dependencies.{' '}
              <Button onClick={() => void detail.refetch()}>Retry details</Button>
            </p>
          )}
          <section className="prod-detail-section" aria-labelledby="prod-depends-heading">
            <h3 id="prod-depends-heading">Blocked by</h3>
            <p className="prod-muted">
              Link tasks that need to happen first. Changes here save immediately.
            </p>
            {!detail.isPending && !detail.isError && depends.length === 0 && (
              <p className="prod-muted">No blocking tasks.</p>
            )}
            <ul className="prod-plain-list">
              {depends.map((edge) => (
                <li key={edge.id}>
                  <Link to={`/n/${edge.dst}`}>
                    {detail.data?.neighbors[edge.dst]?.title ?? 'Untitled task'}
                  </Link>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => void removeDependency(edge.id)}
                    aria-label={`Remove dependency on ${detail.data?.neighbors[edge.dst]?.title ?? 'task'}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <fieldset
              className="prod-picker"
              disabled={disabled || detail.isPending || detail.isError}
            >
              <legend>Blocking task</legend>
              {dependency ? (
                <p>
                  {dependency.title}{' '}
                  <Button size="sm" onClick={() => setDependency(null)}>
                    Change blocking task
                  </Button>
                </p>
              ) : (
                <EntityPicker
                  types={['task']}
                  allowCreate={false}
                  excludeIds={[task?.id ?? '', ...depends.map((edge) => edge.dst)]}
                  onPick={setDependency}
                />
              )}
              <Button disabled={!dependency || disabled} onClick={() => void addDependency()}>
                {busy === 'dependency' ? 'Saving…' : 'Add dependency'}
              </Button>
            </fieldset>
          </section>
          <section className="prod-detail-section" aria-labelledby="prod-timer-heading">
            <h3 id="prod-timer-heading">Timer</h3>
            {entries.isPending ? (
              <p role="status">Loading timer…</p>
            ) : entries.isError ? (
              <p role="alert">
                Couldn't check the timer.{' '}
                <Button onClick={() => void entries.refetch()}>Retry timer</Button>
              </p>
            ) : (
              <p className="prod-muted">{openEntry ? 'Timer running.' : 'Timer stopped.'}</p>
            )}
            <Button
              disabled={disabled || entries.isFetching || entries.isPending || entries.isError}
              onClick={() => void toggleTimer()}
            >
              {busy === 'timer' ? 'Updating timer…' : openEntry ? 'Stop timer' : 'Start timer'}
            </Button>
            {listed.length > 0 && (
              <ul className="prod-time-entries">
                {listed.map((entry) => (
                  <li key={entry.id}>
                    <time dateTime={entry.started_at}>{timeLabel(entry.started_at)}</time>
                    <span>{entry.ended_at ? `to ${timeLabel(entry.ended_at)}` : '(open)'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Sheet>
      {guard.prompt}
    </>
  );
}
