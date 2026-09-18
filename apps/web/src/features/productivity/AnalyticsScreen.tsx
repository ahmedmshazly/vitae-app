import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, FilterGroup, PageHeader } from '@vitae/ui';
import { isValidDateOnly, type AnalyticsWindowDays, type ProductivityFigures } from '@vitae/core';
import { QUADRANT_LABEL, QUADRANT_ORDER } from './model.js';
import { fetchProductivityTasks, useProductivityAnalytics } from './api.js';
import { productivityKeys } from './query-keys.js';
import { isProductivityEnabled } from '../../lib/productivity-flag.js';
import { FigureBlock, type FigureRow } from './FigureBlock.js';
import { QueryPanel } from './QueryPanel.js';

function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unavailable';
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return (
    [hours && `${hours}h`, minutes && `${minutes}m`, whole % 60 && `${whole % 60}s`]
      .filter(Boolean)
      .join(' ') || '0s'
  );
}

function throughputRows(figure: ProductivityFigures['throughput']): FigureRow[] {
  if (figure.history_completeness !== 'complete') return [];
  if (figure.by_day.length)
    return figure.by_day.map((row) => ({
      key: row.period,
      cells: [row.period, String(row.count)],
      value: row.count,
    }));
  return [{ key: 'total', cells: ['Total', String(figure.total)], value: figure.total }];
}

export function AnalyticsScreen() {
  const [params, setParams] = useSearchParams();
  const windowDays: AnalyticsWindowDays =
    params.get('window') === '90' ? 90 : params.get('window') === '365' ? 365 : 30;
  const view =
    params.get('view') === 'current'
      ? 'current'
      : params.get('view') === 'connections'
        ? 'connections'
        : 'activity';
  function setFilter(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    });
  }
  const query = useProductivityAnalytics(windowDays);
  const data = query.data;
  const figures = data?.figures;
  const needsNames =
    view === 'activity' &&
    Boolean(
      figures && (figures.estimates_vs_actuals.rows.length || figures.time_spent.by_task.length),
    );
  const names = useQuery({
    queryKey: productivityKeys.tasks(),
    queryFn: fetchProductivityTasks,
    enabled: isProductivityEnabled() && needsNames,
    retry: false,
  });
  const taskNames = new Map((names.data?.tasks ?? []).map((task) => [task.id, task.title]));
  const taskTitle = (id: string) => taskNames.get(id) ?? `Task ${id}`;

  return (
    <div className="page prod-page prod-analytics">
      <PageHeader
        title="Analytics"
        subtitle="Understand your activity and the shape of your current workload."
        actions={
          <Link className="vt-btn" to="/today/review">
            Open a short review
          </Link>
        }
      />
      <div className="prod-analytics-toolbar">
        <FilterGroup
          label="Window"
          value={String(windowDays)}
          onChange={(value) => setFilter('window', value)}
          options={[
            { key: '30', label: '30 days' },
            { key: '90', label: '90 days' },
            { key: '365', label: '365 days' },
          ]}
        />
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Refreshing…' : 'Refresh figures'}
        </Button>
      </div>
      <FilterGroup
        label="Figure group"
        value={view}
        onChange={(value) => setFilter('view', value)}
        options={[
          { key: 'activity', label: 'Activity' },
          { key: 'current', label: 'Current workload' },
          { key: 'connections', label: 'Connections' },
        ]}
      />
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          hasData={data != null}
          onRetry={() => void query.refetch()}
          loadingLabel="Loading analytics"
          errorTitle="Couldn't load analytics"
          emptyTitle="Figures unavailable"
          emptyHint="Refresh to load the available figures."
          emptyGlyph="graph"
        >
          {data && (
            <p className="prod-analytics-window">
              {isValidDateOnly(data.window.start) && isValidDateOnly(data.window.end) ? (
                <>
                  <time dateTime={data.window.start}>{data.window.start}</time> —{' '}
                  <time dateTime={data.window.end}>{data.window.end}</time>
                </>
              ) : (
                'Date range unavailable'
              )}{' '}
              · {data.time_zone || 'Time zone unavailable'}
            </p>
          )}
          <p className="prod-analytics-scope prod-muted">
            {view === 'activity'
              ? 'Completions, urgency changes and habit checks cover the dates above. Focus time counts sessions started in this window; estimates use all recorded sessions.'
              : 'These figures describe the current workspace, not historical changes in the selected window.'}{' '}
            Sensitive records are excluded. No product-analytics service receives these counts.
          </p>
          {data && data.completeness !== 'complete' && (
            <Banner tone="warning" title="History is incomplete">
              {data.completeness === 'sparse'
                ? 'Some revision details are missing.'
                : 'Revision history cannot establish every measure for this period.'}{' '}
              Unmeasured completions and changes in urgency are omitted, not treated as zero.
            </Banner>
          )}
          {figures ? (
            <div key={`${view}:${windowDays}`}>
              {view === 'activity' && (
                <>
                  {needsNames && names.isPending && (
                    <p role="status">Loading task names… Figures are already available.</p>
                  )}
                  {needsNames && names.isError && (
                    <Banner tone="warning" title="Task names unavailable">
                      Figures are retained with their record IDs.{' '}
                      <Button disabled={names.isFetching} onClick={() => void names.refetch()}>
                        Retry task names
                      </Button>
                    </Banner>
                  )}
                  <FigureBlock
                    title="Throughput"
                    description="Completed tasks by day."
                    emptyHint="Not measured: revision history is incomplete."
                    columns={['Day', 'Completed']}
                    rows={throughputRows(figures.throughput)}
                  />
                  <FigureBlock
                    title="Urgency after create"
                    description="Tasks that became urgent after creation, measured from retained revisions."
                    emptyHint="Not measured: revision history is incomplete."
                    columns={['Measure', 'Count']}
                    rows={
                      figures.urgency_creep.history_completeness === 'complete'
                        ? [
                            {
                              key: 'urgency',
                              cells: [
                                'Became urgent after creation',
                                String(figures.urgency_creep.count),
                              ],
                              value: figures.urgency_creep.count,
                            },
                          ]
                        : []
                    }
                  />
                  <FigureBlock
                    title="Estimates versus actuals"
                    columns={['Task', 'Estimate', 'Recorded time']}
                    description="Current estimates versus all-time sessions with a saved duration, not just this window. The chart compares recorded time only."
                    chartLabel="Recorded focus time"
                    emptyHint="No tasks have both an estimate and a saved session duration."
                    rows={figures.estimates_vs_actuals.rows.map((row) => ({
                      key: row.task_id,
                      cells: [
                        taskTitle(row.task_id),
                        duration(row.effort_min * 60),
                        duration(row.actual_sec),
                      ],
                      value: row.actual_sec,
                      valueLabel: duration(row.actual_sec),
                      href: `/n/${row.task_id}`,
                    }))}
                  />
                  <FigureBlock
                    title="Time spent"
                    description="Full durations of sessions started in this window, including running sessions up to the last refresh."
                    columns={['Task', 'Recorded time']}
                    chartLabel="Recorded focus time"
                    emptyHint="No focus time has been recorded in this window."
                    rows={figures.time_spent.by_task.map((row) => ({
                      key: row.task_id,
                      cells: [taskTitle(row.task_id), duration(row.seconds)],
                      value: row.seconds,
                      valueLabel: duration(row.seconds),
                      href: `/n/${row.task_id}`,
                    }))}
                  />
                  <FigureBlock
                    title="Habits"
                    columns={['Habit', 'Checks']}
                    emptyHint="No habit checks were recorded in this window."
                    rows={figures.habits.by_habit.map((row) => ({
                      key: row.habit_id,
                      cells: [row.title, String(row.checks)],
                      value: row.checks,
                      href: `/n/${row.habit_id}`,
                    }))}
                  />
                </>
              )}
              {view === 'current' && (
                <>
                  <FigureBlock
                    title="Quadrant balance"
                    columns={['Quadrant', 'Count']}
                    rows={QUADRANT_ORDER.map((quadrant) => ({
                      key: quadrant,
                      cells: [QUADRANT_LABEL[quadrant], String(figures.quadrant_balance[quadrant])],
                      value: figures.quadrant_balance[quadrant],
                    }))}
                  />
                  <FigureBlock
                    title="Waiting"
                    description="Overdue follow-ups include all non-archived tasks, not only waiting tasks."
                    columns={['Measure', 'Count']}
                    rows={[
                      {
                        key: 'waiting',
                        cells: ['Waiting', String(figures.waiting.waiting)],
                        value: figures.waiting.waiting,
                        href: '/today/waiting',
                      },
                      {
                        key: 'overdue',
                        cells: ['Overdue follow-ups', String(figures.waiting.overdue_follow_up)],
                        value: figures.waiting.overdue_follow_up,
                      },
                    ]}
                  />
                  <FigureBlock
                    title="Application stages"
                    columns={['Stage', 'Count']}
                    rows={figures.application_funnel.rows.map((row) => ({
                      key: row.stage,
                      cells: [row.stage, String(row.count)],
                      value: row.count,
                    }))}
                  />
                </>
              )}
              {view === 'connections' && (
                <>
                  <FigureBlock
                    title="Goals"
                    columns={['Goal', 'Tasks']}
                    emptyHint="No goal records are available for this figure."
                    rows={figures.goals.rows.map((row) => ({
                      key: row.goal_id,
                      cells: [row.title, String(row.tasks)],
                      value: row.tasks,
                      href: `/n/${row.goal_id}`,
                    }))}
                  />
                  <FigureBlock
                    title="By person or organization"
                    columns={['Name', 'Waiting on', 'For']}
                    description="Task relationships with people and organizations. The chart adds both relationship counts."
                    chartLabel="Total task relationships"
                    emptyHint="No person or organization is linked to these tasks yet."
                    rows={figures.by_entity.rows.map((row) => ({
                      key: row.entity_id,
                      cells: [row.title, String(row.waiting_on), String(row.for)],
                      value: row.waiting_on + row.for,
                      href: `/n/${row.entity_id}`,
                    }))}
                  />
                </>
              )}
            </div>
          ) : (
            data && (
              <Banner tone="warning" title="Figures missing from the response">
                Refresh to try again. An incomplete response is not a zero count.
              </Banner>
            )
          )}
        </QueryPanel>
      </div>
    </div>
  );
}
