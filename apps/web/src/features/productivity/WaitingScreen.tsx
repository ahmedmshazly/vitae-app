import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Field, Input, PageHeader, Row } from '@vitae/ui';
import type { TaskReadModel } from '@vitae/core';
import { ApiError, api } from '../../lib/api.js';
import { useProductivityWaiting } from './api.js';
import { STATUS_LABEL, todayDateOnly } from './model.js';
import { QueryPanel } from './QueryPanel.js';
import { useProductivityActions } from './use-productivity-actions.js';

interface NodePage {
  edges: Array<{ type: string; src: string; dst: string }>;
  neighbors: Record<string, { id: string; title: string }>;
}

export function WaitingScreen() {
  const list = useProductivityWaiting();
  const actions = useProductivityActions();
  const tasks = list.data?.tasks ?? [];
  const names = useQuery({
    queryKey: ['productivity', 'waiting-on', tasks.map((task) => task.id)],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        tasks.map(async (task) => {
          try {
            const page = await api.get<NodePage>(`/nodes/${task.id}`);
            const edge = page.edges.find((item) => item.type === 'WAITING_ON' && item.src === task.id);
            if (edge && page.neighbors[edge.dst]) map[task.id] = page.neighbors[edge.dst]!.title;
          } catch (error) {
            if (error instanceof ApiError && (error.status === 404 || error.status === 402)) return;
          }
        }),
      );
      return map;
    },
    enabled: tasks.length > 0,
    retry: false,
  });
  const [dates, setDates] = useState<Record<string, string>>({});
  const defaultDate = useMemo(() => todayDateOnly(), []);

  return (
    <div className="page prod-page">
      <PageHeader title="Waiting" subtitle="Items with status Waiting, and the next follow-up date." />
      {actions.locked ? (
        <p className="prod-lock" role="status">
          {actions.writeLock}
        </p>
      ) : null}
      {actions.conflict ? (
        <Banner tone="warning" title="This record changed">
          {actions.conflict}
        </Banner>
      ) : null}
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={tasks.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading waiting items"
          errorTitle="Couldn't load waiting items"
          emptyTitle="Nothing is waiting"
          emptyHint="When a task waits on someone, it will list here with a follow-up date."
          emptyGlyph="bell"
        >
          <ul className="prod-list">
            {tasks.map((task) => (
              <WaitingRow
                key={task.id}
                task={task}
                waitingOn={names.data?.[task.id]}
                date={dates[task.id] ?? task.follow_up ?? defaultDate}
                locked={actions.locked}
                onDate={(value) => setDates((current) => ({ ...current, [task.id]: value }))}
                onFollowUp={() => void actions.followUp(task, dates[task.id] ?? task.follow_up ?? defaultDate)}
              />
            ))}
          </ul>
        </QueryPanel>
      </div>
    </div>
  );
}

function WaitingRow({
  task,
  waitingOn,
  date,
  locked,
  onDate,
  onFollowUp,
}: {
  task: TaskReadModel;
  waitingOn?: string;
  date: string;
  locked: boolean;
  onDate: (value: string) => void;
  onFollowUp: () => void;
}) {
  const followLabel = task.follow_up ? `Follow-up ${task.follow_up}` : 'No follow-up date';
  return (
    <Row
      as="li"
      title={task.title}
      subtitle={[STATUS_LABEL[task.status], waitingOn ? `Waiting on ${waitingOn}` : null, followLabel]
        .filter(Boolean)
        .join(' · ')}
      actions={
        <span className="prod-actions">
          <Field label={`Follow-up date for ${task.title}`} htmlFor={`wait-follow-${task.id}`}>
            <Input
              id={`wait-follow-${task.id}`}
              type="date"
              value={date}
              onChange={(event) => onDate(event.target.value)}
              disabled={locked}
            />
          </Field>
          <Button type="button" size="sm" disabled={locked || !date} onClick={onFollowUp}>
            Set follow-up
          </Button>
        </span>
      }
    />
  );
}
