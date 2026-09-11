import { useEffect, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  Stack,
} from '@vitae/ui';
import type { Importance, Recurrence, TaskReadModel, VitaePriority } from '@vitae/core';
import { ApiError, api } from '../../lib/api.js';
import { useProductivityTimeEntries } from './api.js';
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

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'p1' },
  { value: 'p2', label: 'p2' },
  { value: 'p3', label: 'p3' },
  { value: 'p4', label: 'p4' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'none', label: 'none' },
  { value: 'important', label: 'important' },
  { value: 'critical', label: 'critical' },
];

const MODE_OPTIONS = [
  { value: 'fixed', label: 'fixed' },
  { value: 'from_completion', label: 'from completion' },
];

export interface TaskDetailProps {
  task: TaskReadModel | null;
  projectTitle?: string;
  locked: boolean;
  actions: ReturnType<typeof useProductivityActions>;
  onClose: () => void;
}

export function TaskDetail({ task, projectTitle, locked, actions, onClose }: TaskDetailProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [target, setTarget] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [priority, setPriority] = useState<string | undefined>();
  const [importance, setImportance] = useState<string | undefined>();
  const [rrule, setRrule] = useState('');
  const [mode, setMode] = useState<string>('fixed');
  const [depends, setDepends] = useState<Array<{ edgeId: string; id: string; title: string }>>([]);
  const [depId, setDepId] = useState('');
  const [depError, setDepError] = useState<string | null>(null);
  const entries = useProductivityTimeEntries(task?.id);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDue(task.due ?? '');
    setTarget(task.target ?? '');
    setFollowUp(task.follow_up ?? '');
    setPriority(task.priority);
    setImportance(task.importance);
    setRrule('');
    setMode('fixed');
    setDepends([]);
    setDepError(null);
    let cancelled = false;
    void api
      .get<NodePage>(`/nodes/${task.id}`)
      .then((page) => {
        if (cancelled) return;
        const recurrence = page.node.props?.recurrence as Recurrence | undefined;
        if (recurrence?.rrule) {
          setRrule(recurrence.rrule);
          setMode(recurrence.mode);
        }
        setDepends(
          page.edges
            .filter((edge) => edge.type === 'DEPENDS_ON' && edge.src === task.id)
            .map((edge) => ({
              edgeId: edge.id,
              id: edge.dst,
              title: page.neighbors[edge.dst]?.title ?? edge.dst,
            })),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setDepError('Dependencies are not available for this record.');
          return;
        }
        setDepError(error instanceof Error ? error.message : 'Could not load dependencies.');
      });
    return () => {
      cancelled = true;
    };
  }, [task]);

  if (!task) return null;

  const listed = entries.data?.time_entries ?? [];
  const closedStarts = new Set(listed.filter((entry) => entry.ended_at).map((entry) => entry.started_at));
  const openEntry = listed.find((entry) => !entry.ended_at && !closedStarts.has(entry.started_at));
  const running = Boolean(openEntry);

  async function save() {
    if (!task) return;
    await actions.update(task, {
      title: title.trim() || task.title,
      due: due || undefined,
      target: target || undefined,
      follow_up: followUp || undefined,
      priority: priority as VitaePriority | undefined,
      importance: importance as Importance | undefined,
    });
    if (rrule.trim()) {
      await actions.setRecurrence(task, {
        rrule: rrule.trim(),
        mode: mode === 'from_completion' ? 'from_completion' : 'fixed',
        exceptions: [],
      });
    }
  }

  async function addDependency() {
    if (!task || !depId.trim()) return;
    setDepError(null);
    try {
      const created = await api.post<{ edge: EdgeLite }>('/edges', {
        type: 'DEPENDS_ON',
        src: task.id,
        dst: depId.trim(),
      });
      setDepends((rows) => [
        ...rows,
        { edgeId: created.edge.id, id: depId.trim(), title: depId.trim() },
      ]);
      setDepId('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setDepError('That record was not found.');
        return;
      }
      setDepError(error instanceof Error ? error.message : 'Could not add the dependency.');
    }
  }

  async function removeDependency(edgeId: string) {
    setDepError(null);
    try {
      await api.del(`/edges/${edgeId}`);
      setDepends((rows) => rows.filter((row) => row.edgeId !== edgeId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setDepends((rows) => rows.filter((row) => row.edgeId !== edgeId));
        return;
      }
      setDepError(error instanceof Error ? error.message : 'Could not remove the dependency.');
    }
  }

  async function toggleTimer() {
    if (!task) return;
    if (openEntry) {
      await actions.addTimeEntry(task.id, openEntry.started_at, new Date().toISOString());
      return;
    }
    await actions.addTimeEntry(task.id, new Date().toISOString());
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={task.title}
      wide
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="primary" disabled={locked} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {projectTitle ? <p className="prod-muted">Project {projectTitle}</p> : null}
        <Field label="Title" htmlFor="prod-title">
          <Input id="prod-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={locked} />
        </Field>
        <Field label="Due" htmlFor="prod-due">
          <Input id="prod-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} disabled={locked} />
        </Field>
        <Field label="Target" htmlFor="prod-target">
          <Input
            id="prod-target"
            type="date"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Follow-up" htmlFor="prod-follow">
          <Input
            id="prod-follow"
            type="date"
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Priority" htmlFor="prod-priority">
          <Select
            id="prod-priority"
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={PRIORITY_OPTIONS}
            disabled={locked}
          />
        </Field>
        <Field label="Importance" htmlFor="prod-importance">
          <Select
            id="prod-importance"
            label="Importance"
            value={importance}
            onChange={setImportance}
            options={IMPORTANCE_OPTIONS}
            disabled={locked}
          />
        </Field>
        <Field label="Recurrence (rrule)" htmlFor="prod-rrule" help="Leave blank to keep the stored recurrence.">
          <Input id="prod-rrule" value={rrule} onChange={(event) => setRrule(event.target.value)} disabled={locked} />
        </Field>
        <Field label="Recurrence mode" htmlFor="prod-mode">
          <Select
            id="prod-mode"
            label="Recurrence mode"
            value={mode}
            onChange={(value) => setMode(value ?? 'fixed')}
            options={MODE_OPTIONS}
            disabled={locked}
          />
        </Field>
        <section aria-labelledby="prod-depends-heading">
          <h3 id="prod-depends-heading" className="prod-subhead">
            Depends on
          </h3>
          {depends.length === 0 ? <p className="prod-muted">No DEPENDS_ON edges.</p> : null}
          <ul className="prod-plain-list">
            {depends.map((row) => (
              <li key={row.edgeId}>
                <span>{row.title}</span>
                <Button type="button" size="sm" disabled={locked} onClick={() => void removeDependency(row.edgeId)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="prod-inline-form">
            <Field label="Record id" htmlFor="prod-dep">
              <Input id="prod-dep" value={depId} onChange={(event) => setDepId(event.target.value)} disabled={locked} />
            </Field>
            <Button type="button" disabled={locked || !depId.trim()} onClick={() => void addDependency()}>
              Add dependency
            </Button>
          </div>
          {depError ? (
            <p role="status" className="prod-muted">
              {depError}
            </p>
          ) : null}
        </section>
        <section aria-labelledby="prod-timer-heading">
          <h3 id="prod-timer-heading" className="prod-subhead">
            Timer
          </h3>
          <p className="prod-muted">{running ? 'Timer running.' : 'Timer stopped.'}</p>
          <Button type="button" disabled={locked} onClick={() => void toggleTimer()}>
            {running ? 'Stop timer' : 'Start timer'}
          </Button>
          {(entries.data?.time_entries ?? []).length > 0 ? (
            <ul className="prod-plain-list">
              {(entries.data?.time_entries ?? []).map((entry) => (
                <li key={entry.id}>
                  {entry.started_at}
                  {entry.ended_at ? ` → ${entry.ended_at}` : ' (open)'}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </Stack>
    </Sheet>
  );
}
