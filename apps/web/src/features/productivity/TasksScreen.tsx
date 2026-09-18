import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Field, FilterGroup, Input, Modal, PageHeader, Section } from '@vitae/ui';
import { matchTask, parseProductivityFilter, type Quadrant, type TaskReadModel } from '@vitae/core';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';
import { api } from '../../lib/api.js';
import { useProductivityTasks } from './api.js';
import { placementCopy, quadrantOf, QUADRANT_LABEL, QUADRANT_ORDER } from './model.js';
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
  const [params, setParams] = useSearchParams();
  const layout: Layout = params.get('layout') === 'matrix' ? 'matrix' : 'list';
  const viewId = params.get('view') || 'all';
  const projectFilter = params.get('project') || 'all';
  const search = params.get('q') || '';
  function filter(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === 'all' || (key === 'layout' && value === 'list')) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key === 'q' },
    );
  }
  function clearFilters() {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      ['q', 'view', 'project'].forEach((key) => next.delete(key));
      return next;
    });
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capture, setCapture] = useState('');
  const [placementNote, setPlacementNote] = useState<string | null>(null);
  const [waitingTask, setWaitingTask] = useState<TaskReadModel | null>(null);
  const [waitingOn, setWaitingOn] = useState<PickedEntity | null>(null);
  const captureFlight = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const captureGuard = useUnsavedChanges(Boolean(capture.trim()), { busy: capturing });
  const waitGuard = useUnsavedChanges(Boolean(waitingOn), {
    busy: actions.isPending,
    onClose: () => {
      setWaitingTask(null);
      setWaitingOn(null);
    },
  });

  const projectTitle = useMemo(() => {
    const map = new Map((projects.data?.nodes ?? []).map((node) => [node.id, node.title]));
    return (id: string | undefined) => (id ? map.get(id) : undefined);
  }, [projects.data?.nodes]);

  const tasks = list.data?.tasks ?? [];
  const savedView = (views.data?.views ?? []).find((view) => view.id === viewId);
  const viewFilter = parseProductivityFilter(
    (savedView?.query ?? '').replace(/\btype:task\b/gi, ''),
  );
  const unavailableView = viewId !== 'all' && !savedView;
  const invalidView = viewId !== 'all' && viewFilter.invalid.length > 0;
  const filtered = Boolean(search || viewId !== 'all' || projectFilter !== 'all');
  const visible = tasks.filter((task) => {
    if (unavailableView || invalidView) return false;
    if (viewId !== 'all' && !matchTask(task, viewFilter)) return false;
    if (search && !task.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (projectFilter !== 'all' && task.project_id !== projectFilter) return false;
    return true;
  });
  const selected =
    visible.find((task) => task.id === selectedId) ??
    tasks.find((task) => task.id === selectedId) ??
    null;
  const usedProjects = [
    ...new Map(
      tasks
        .filter((task) => task.project_id)
        .map((task) => [task.project_id!, projectTitle(task.project_id) ?? task.project_id!]),
    ),
  ];

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    if (captureFlight.current || actions.locked || !capture.trim()) return;
    captureFlight.current = true;
    setCapturing(true);
    setPlacementNote(null);
    const submitted = capture;
    try {
      const outcome = await actions.createFromCapture(submitted);
      if (!outcome) return;
      setCapture((current) => (current === submitted ? '' : current));
      const createdId = outcome.result.task?.id;
      const fromCache = (await list.refetch()).data?.tasks.find((task) => task.id === createdId);
      if (fromCache) {
        setPlacementNote(
          `Placed in ${QUADRANT_LABEL[quadrantOf(fromCache)]}: ${placementCopy(fromCache)}`,
        );
      } else {
        setPlacementNote('Task created. Placement will show after the list refreshes.');
      }
    } finally {
      captureFlight.current = false;
      setCapturing(false);
    }
  }

  async function confirmWait() {
    if (!waitingTask || !waitingOn || actions.locked) return;
    const outcome = await actions.waitOn(waitingTask, waitingOn.id);
    // A rejected command (including a revision conflict) leaves the dialog
    // and its draft in place. Closing it would hide the recovery path and
    // make the person re-enter an identifier before they can retry.
    if (!outcome) return;
    setWaitingTask(null);
    setWaitingOn(null);
  }

  const writeNotice = actions.writeLock ? (
    <p className="prod-lock" role="status">
      {actions.writeLock}
    </p>
  ) : null;

  return (
    <div className="page prod-page prod-tasks">
      <PageHeader title="Tasks" subtitle="Capture what's next. Make room for what matters." />
      {writeNotice}
      {actions.conflict ? (
        <Banner tone="warning" title="This record changed">
          {actions.conflict}
          <Button onClick={() => void list.refetch()} disabled={list.isFetching}>
            Refresh tasks
          </Button>
        </Banner>
      ) : null}
      {actions.error && !actions.conflict && !actions.writeLock ? (
        <Banner tone="danger" title="Change couldn't be confirmed">
          {actions.error.message} Your input is still here. Check the task before trying again.
        </Banner>
      ) : null}
      <Section title="Capture">
        <form className="prod-capture" onSubmit={(event) => void submitCapture(event)}>
          <Field
            label="Capture a task"
            htmlFor="prod-capture"
            help="Add a title, or include a date and importance: Send the brief due tomorrow !important"
          >
            <Input
              id="prod-capture"
              value={capture}
              onChange={(event) => setCapture(event.target.value)}
              disabled={Boolean(actions.writeLock)}
              placeholder="What needs to happen?"
              maxLength={500}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={actions.locked || capturing || !capture.trim()}
          >
            {capturing ? 'Adding…' : 'Add task'}
          </Button>
        </form>
        {placementNote ? (
          <p role="status" className="prod-placement">
            {placementNote}
          </p>
        ) : null}
        {actions.captureWarning && <p role="alert">{actions.captureWarning}</p>}
      </Section>
      <Section title="Your tasks">
        <div className="prod-task-toolbar">
          <FilterGroup
            label="Task layout"
            value={layout}
            onChange={(value) => filter('layout', value)}
            options={[
              { key: 'list', label: 'List' },
              { key: 'matrix', label: 'Matrix' },
            ]}
          />
          <Button
            disabled={list.isFetching || actions.isPending}
            onClick={() => void list.refetch()}
          >
            {list.isFetching ? 'Refreshing…' : 'Refresh tasks'}
          </Button>
        </div>
        <div className="prod-task-filters">
          <Field label="Search tasks" htmlFor="prod-search">
            <Input
              id="prod-search"
              type="search"
              value={search}
              onChange={(event) => filter('q', event.target.value)}
              placeholder="Find a task by title…"
            />
          </Field>
          <Field label="Saved view" htmlFor="prod-view">
            <select
              className="vt-inp"
              id="prod-view"
              value={viewId}
              onChange={(event) => filter('view', event.target.value)}
            >
              <option value="all">All views</option>
              {unavailableView && <option value={viewId}>Unavailable view</option>}
              {(views.data?.views ?? []).map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project" htmlFor="prod-project">
            <select
              className="vt-inp"
              id="prod-project"
              value={projectFilter}
              onChange={(event) => filter('project', event.target.value)}
            >
              <option value="all">All projects</option>
              {projectFilter !== 'all' && !usedProjects.some(([id]) => id === projectFilter) && (
                <option value={projectFilter}>Unavailable project</option>
              )}
              {usedProjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(views.isError || projects.isError) && (
          <p role="status" className="prod-muted">
            Some view or project names couldn't load.{' '}
            <Button
              size="sm"
              onClick={() => {
                void views.refetch();
                void projects.refetch();
              }}
            >
              Retry filters
            </Button>
          </p>
        )}
        {invalidView && (
          <p role="alert">
            This saved view uses filters Tasks cannot apply:{' '}
            {viewFilter.invalid.map((item) => item.raw).join(', ')}. Choose another view or clear
            filters.
          </p>
        )}
        {unavailableView && !views.isLoading && (
          <p role="status">This saved view is unavailable. Choose another view or clear filters.</p>
        )}
        <div className="prod-task-toolbar">
          <p className="prod-muted">
            {visible.length} shown · {tasks.length} total
          </p>
          {filtered && (
            <Button size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
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
          emptyTitle={filtered ? 'No matching tasks' : 'No tasks yet'}
          emptyHint={
            filtered
              ? 'Try another title, saved view or project.'
              : 'Capture your first task above. You can add dates and details later.'
          }
          emptyAction={
            filtered ? (
              <Button onClick={clearFilters}>Show all tasks</Button>
            ) : (
              <Button onClick={() => document.getElementById('prod-capture')?.focus()}>
                Capture a task
              </Button>
            )
          }
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
        key={selected?.id ?? 'closed'}
        task={selected}
        projectTitle={projectTitle(selected?.project_id)}
        locked={actions.locked}
        actions={actions}
        onClose={() => setSelectedId(null)}
      />
      <Modal
        open={waitingTask != null}
        onOpenChange={waitGuard.onOpenChange}
        title="Wait on someone"
        description={`Who are you waiting on for “${waitingTask?.title ?? 'this task'}”? Choose a person or organization.`}
        footer={
          <>
            <Button type="button" onClick={waitGuard.requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={actions.locked || !waitingOn}
              onClick={() => void confirmWait()}
            >
              {actions.isPending ? 'Saving…' : 'Confirm wait'}
            </Button>
          </>
        }
      >
        {actions.error && <p role="alert">{actions.error.message}</p>}
        <fieldset className="prod-picker prod-wait-picker" disabled={actions.locked}>
          <legend>Waiting on</legend>
          {waitingOn ? (
            <p>
              {waitingOn.title}{' '}
              <Button size="sm" onClick={() => setWaitingOn(null)}>
                Change person or organization
              </Button>
            </p>
          ) : (
            <EntityPicker types={['person', 'organization']} onPick={setWaitingOn} />
          )}
        </fieldset>
      </Modal>
      {captureGuard.prompt}
      {waitGuard.prompt}
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
