import { Button, Card, Chip, ChipGroup, Row } from '@vitae/ui';
import type { TaskReadModel } from '@vitae/core';
import { placementCopy, quadrantOf, QUADRANT_LABEL, STATUS_LABEL } from './model.js';

export interface TaskCardProps {
  task: TaskReadModel;
  projectTitle?: string;
  selected?: boolean;
  layout: 'list' | 'matrix';
  locked: boolean;
  canUndo: boolean;
  onSelect: (id: string) => void;
  onComplete: (task: TaskReadModel) => void;
  onDrop: (task: TaskReadModel) => void;
  onWait: (task: TaskReadModel) => void;
  onUndo: () => void;
}

function Actions({
  task,
  locked,
  canUndo,
  onComplete,
  onDrop,
  onWait,
  onUndo,
}: Pick<TaskCardProps, 'task' | 'locked' | 'canUndo' | 'onComplete' | 'onDrop' | 'onWait' | 'onUndo'>) {
  return (
    <span className="prod-actions">
      <Button type="button" size="sm" disabled={locked} onClick={() => onComplete(task)}>
        Complete
      </Button>
      <Button type="button" size="sm" disabled={locked} onClick={() => onDrop(task)}>
        Drop
      </Button>
      <Button type="button" size="sm" disabled={locked} onClick={() => onWait(task)}>
        Wait
      </Button>
      <Button type="button" size="sm" disabled={locked || !canUndo} onClick={onUndo}>
        Undo
      </Button>
    </span>
  );
}

export function TaskCard({
  task,
  projectTitle,
  selected,
  layout,
  locked,
  canUndo,
  onSelect,
  onComplete,
  onDrop,
  onWait,
  onUndo,
}: TaskCardProps) {
  const quadrant = quadrantOf(task);
  const reason = placementCopy(task);
  const status = STATUS_LABEL[task.status];
  const actions = (
    <Actions
      task={task}
      locked={locked}
      canUndo={canUndo}
      onComplete={onComplete}
      onDrop={onDrop}
      onWait={onWait}
      onUndo={onUndo}
    />
  );

  const chips = (
    <ChipGroup>
      <Chip>{status}</Chip>
      <Chip>{QUADRANT_LABEL[quadrant]}</Chip>
      {projectTitle ? <Chip>{projectTitle}</Chip> : null}
    </ChipGroup>
  );

  if (layout === 'list') {
    return (
      <Row
        as="li"
        interactive
        selected={selected}
        title={
          <button type="button" className="prod-title-btn" onClick={() => onSelect(task.id)}>
            {task.title}
          </button>
        }
        subtitle={reason}
        meta={chips}
        actions={actions}
      />
    );
  }

  return (
    <Card
      interactive
      className="prod-card"
      title={
        <button type="button" className="prod-title-btn" onClick={() => onSelect(task.id)}>
          {task.title}
        </button>
      }
      actions={actions}
      data-quadrant={quadrant}
    >
      {chips}
      <p className="prod-reason">{reason}</p>
    </Card>
  );
}
