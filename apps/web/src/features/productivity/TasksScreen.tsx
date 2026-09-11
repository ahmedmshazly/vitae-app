import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Field,
  FilterGroup,
  Input,
  Modal,
  PageHeader,
  Section,
} from '@vitae/ui';
import type { Quadrant, TaskReadModel } from '@vitae/core';
import { api } from '../../lib/api.js';
import { useProductivityTasks } from './api.js';
import {
  placementCopy,
  quadrantOf,
  QUADRANT_LABEL,
  QUADRANT_ORDER,
} from './model.js';
import { QueryPanel } from './QueryPanel.js';
import { TaskCard } from './TaskCard.js';
import { TaskDetail } from './TaskDetail.js';
import { useProductivityActions } from './use-productivity-actions.js';

type Layout = 'list' | 'matrix';

interface SavedView {
  id: string;
  name: string;
  query: string;
}

interface NamedNode {
  id: string;
  title: string;
}

function taskMatchesView(task: TaskReadModel, query: string): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  if (/\btype:/.test(raw) && !/\btype:task\b/.test(raw)) return false;
  const status = /\bstatus:(\w+)/.exec(raw);
  if (status && task.status !== status[1]) return false;
  const text = raw.replace(/\b\w+:\S+/g, '').trim();
  if (text && !task.title.toLowerCase().includes(text)) return false;
  return true;
}

export function TasksScreen() {
  const list = useProductivityTasks();
  const actions = useProductivityActions();
  const views = useQuery({
    queryKey: ['views'],
    queryFn: () => api.get<{ views: SavedView[] }>('/views'),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['nodes', 'project'],
    queryFn: () => api.get<{ nodes: NamedNode[] }>('/nodes?type=project&limit=200'),
    retry: false,
  });
  const [layout, setLayout] = useState<Layout>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capture, setCapture] = useState('');
  const [placementNote, setPlacementNote] = useState<string | null>(null);
  const [waitingTask, setWaitingTask] = useState<TaskReadModel | null>(null);
  const [waitingOnId, setWaitingOnId] = useState('');
  const [viewId, setViewId] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const projectTitle = useMemo(() => {
    const map = new Map((projects.data?.nodes ?? []).map((node) => [node.id, node.title]));
    return (id: string | undefined) => (id ? map.get(id) : undefined);
  }, [projects.data?.nodes]);

  const tasks = list.data?.tasks ?? [];
  const viewQuery = (views.data?.views ?? []).find((view) => view.id === viewId)?.query ?? '';
  const visible = tasks.filter((task) => {
    if (viewId !== 'all' && !taskMatchesView(task, viewQuery)) return false;
    if (projectFilter !== 'all' && task.project_id !== projectFilter) return false;
    return true;
  });
  const selected = visible.find((task) => task.id === selectedId) ?? tasks.find((task) => task.id === selectedId) ?? null;
  const usedProjects = [...new Map(
    tasks
      .filter((task) => task.project_id)
      .map((task) => [task.project_id!, projectTitle(task.project_id) ?? task.project_id!]),
  )];

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const outcome = await actions.createFromCapture(capture);
    if (!outcome) return;
    setCapture('');
    const createdId = outcome.result.task?.id;
    await list.refetch();
    const created = (list.data?.tasks ?? []).find((task) => task.id === createdId);
    const fromCache = created ?? (await list.refetch()).data?.tasks.find((task) => task.id === createdId);
    if (fromCache) {
      setPlacementNote(`Placed in ${QUADRANT_LABEL[quadrantOf(fromCache)]}: ${placementCopy(fromCache)}`);
    } else {
      setPlacementNote('Task created. Placement will show after the list refreshes.');
    }
  }

  async function confirmWait() {
    if (!waitingTask || !waitingOnId.trim()) return;
    await actions.waitOn(waitingTask, waitingOnId.trim());
    setWaitingTask(null);
    setWaitingOnId('');
  }

  const writeNotice = actions.locked ? (
    <p className="prod-lock" role="status">
      {actions.writeLock}
    </p>
  ) : null;

  return (
    <div className="page prod-page">
      <PageHeader
        title="Tasks"
        subtitle="List or matrix. Each card states its status and why it sits in a quadrant."
      />
      {writeNotice}
      {actions.conflict ? (
        <Banner tone="warning" title="This record changed">
          {actions.conflict}
        </Banner>
      ) : null}
      <Section title="Capture">
        <form className="prod-capture" onSubmit={(event) => void submitCapture(event)}>
          <Field label="Capture a task" htmlFor="prod-capture">
            <Input
              id="prod-capture"
              value={capture}
              onChange={(event) => setCapture(event.target.value)}
              disabled={actions.locked}
              placeholder="Title due tomorrow !important"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={actions.locked || !capture.trim()}>
            Add task
          </Button>
        </form>
        {placementNote ? (
          <p role="status" className="prod-placement">
            {placementNote}
          </p>
        ) : null}
      </Section>
      <Section title="Layout">
        <FilterGroup
          label="Task layout"
          value={layout}
          onChange={setLayout}
          options={[
            { key: 'list', label: 'List' },
            { key: 'matrix', label: 'Matrix' },
          ]}
        />
        {(views.data?.views ?? []).length > 0 ? (
          <FilterGroup
            label="Saved views"
            value={viewId}
            onChange={setViewId}
            options={[
              { key: 'all', label: 'All views' },
              ...(views.data?.views ?? []).map((view) => ({ key: view.id, label: view.name })),
            ]}
          />
        ) : null}
        {usedProjects.length > 0 ? (
          <FilterGroup
            label="Projects"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { key: 'all', label: 'All projects' },
              ...usedProjects.map(([id, name]) => ({ key: id, label: name })),
            ]}
          />
        ) : null}
      </Section>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={visible.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading tasks"
          errorTitle="Couldn't load tasks"
          emptyTitle="No tasks yet"
          emptyHint="Capture a title above. It will appear in a quadrant once the server places it."
        >
          {layout === 'list' ? (
            <ul className="prod-list">
              {visible.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  projectTitle={projectTitle(task.project_id)}
                  selected={task.id === selectedId}
                  layout="list"
                  locked={actions.locked}
                  canUndo={actions.lastUndo?.taskId === task.id}
                  onSelect={setSelectedId}
                  onComplete={(item) => void actions.complete(item)}
                  onDrop={(item) => void actions.drop(item)}
                  onWait={setWaitingTask}
                  onUndo={() => void actions.undoLast()}
                />
              ))}
            </ul>
          ) : (
            <div className="prod-matrix">
              {QUADRANT_ORDER.map((quadrant) => (
                <QuadrantColumn
                  key={quadrant}
                  quadrant={quadrant}
                  tasks={visible.filter((task) => quadrantOf(task) === quadrant)}
                  selectedId={selectedId}
                  projectTitle={projectTitle}
                  locked={actions.locked}
                  lastUndoId={actions.lastUndo?.taskId}
                  onSelect={setSelectedId}
                  onComplete={(item) => void actions.complete(item)}
                  onDrop={(item) => void actions.drop(item)}
                  onWait={setWaitingTask}
                  onUndo={() => void actions.undoLast()}
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
      <TaskDetail
        task={selected}
        projectTitle={projectTitle(selected?.project_id)}
        locked={actions.locked}
        actions={actions}
        onClose={() => setSelectedId(null)}
      />
      <Modal
        open={waitingTask != null}
        onOpenChange={(open) => {
          if (!open) {
            setWaitingTask(null);
            setWaitingOnId('');
          }
        }}
        title="Wait on someone"
        description="Waiting requires a person or organization record id."
        footer={
          <>
            <Button
              type="button"
              onClick={() => {
                setWaitingTask(null);
                setWaitingOnId('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={actions.locked || !waitingOnId.trim()}
              onClick={() => void confirmWait()}
            >
              Confirm wait
            </Button>
          </>
        }
      >
        <Field label="Person or organization id" htmlFor="prod-wait-on">
          <Input
            id="prod-wait-on"
            value={waitingOnId}
            onChange={(event) => setWaitingOnId(event.target.value)}
            disabled={actions.locked}
          />
        </Field>
      </Modal>
    </div>
  );
}

function QuadrantColumn({
  quadrant,
  tasks,
  selectedId,
  projectTitle,
  locked,
  lastUndoId,
  onSelect,
  onComplete,
  onDrop,
  onWait,
  onUndo,
}: {
  quadrant: Quadrant;
  tasks: TaskReadModel[];
  selectedId: string | null;
  projectTitle: (id: string | undefined) => string | undefined;
  locked: boolean;
  lastUndoId?: string;
  onSelect: (id: string) => void;
  onComplete: (task: TaskReadModel) => void;
  onDrop: (task: TaskReadModel) => void;
  onWait: (task: TaskReadModel) => void;
  onUndo: () => void;
}) {
  const label = QUADRANT_LABEL[quadrant];
  return (
    <section className={`prod-quad prod-quad--${quadrant}`} aria-label={label}>
      <h2 className="prod-quad__title">
        <span className="prod-quad__mark" aria-hidden />
        {label}
      </h2>
      {tasks.length === 0 ? <p className="prod-muted">Nothing in {label}.</p> : null}
      <ul className="prod-quad__list">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              projectTitle={projectTitle(task.project_id)}
              selected={task.id === selectedId}
              layout="matrix"
              locked={locked}
              canUndo={lastUndoId === task.id}
              onSelect={onSelect}
              onComplete={onComplete}
              onDrop={onDrop}
              onWait={onWait}
              onUndo={onUndo}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
