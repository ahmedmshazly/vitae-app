import { useState } from 'react';
import { Banner, FilterGroup, PageHeader } from '@vitae/ui';
import type { AnalyticsWindowDays, ProductivityFigures } from '@vitae/core';
import { QUADRANT_LABEL, QUADRANT_ORDER } from './model.js';
import { useProductivityAnalytics } from './api.js';
import { FigureBlock, type FigureRow } from './FigureBlock.js';
import { QueryPanel } from './QueryPanel.js';

function completenessCopy(value: string): string {
  if (value === 'sparse') {
    return 'History for this window is sparse. Older revisions may not include field-level changes, so some counts stay at zero rather than guessing.';
  }
  return 'History for this window is unknown. No revisions were retained, so completions and creep are not measured.';
}

function quadrantRows(figures: ProductivityFigures): FigureRow[] {
  return QUADRANT_ORDER.map((quadrant) => ({
    key: quadrant,
    cells: [QUADRANT_LABEL[quadrant], String(figures.quadrant_balance[quadrant])],
    value: figures.quadrant_balance[quadrant],
  }));
}

export function AnalyticsScreen() {
  const [windowDays, setWindowDays] = useState<AnalyticsWindowDays>(30);
  const query = useProductivityAnalytics(windowDays);
  const data = query.data;
  const figures = data?.figures;

  return (
    <div className="page prod-page">
      <PageHeader
        title="Analytics"
        subtitle="Private counts from this workspace. Nothing is sent to a product-analytics service."
      />
      <FilterGroup
        label="Window"
        value={String(windowDays) as '30' | '90' | '365'}
        onChange={(key) => setWindowDays(Number(key) as AnalyticsWindowDays)}
        options={[
          { key: '30', label: '30 days' },
          { key: '90', label: '90 days' },
          { key: '365', label: '365 days' },
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
          emptyTitle="No analytics yet"
          emptyHint="Figures appear once this workspace has tasks, time, or habit checks."
          emptyGlyph="graph"
        >
          {data && data.completeness !== 'complete' ? (
            <Banner tone="warning" title="History is incomplete">
              {completenessCopy(data.completeness)}
            </Banner>
          ) : null}
          {figures ? (
            <>
              <FigureBlock title="Quadrant balance" columns={['Quadrant', 'Count']} rows={quadrantRows(figures)} />
              <FigureBlock
                title="Urgency after create"
                columns={['Measure', 'Count']}
                rows={[
                  {
                    key: 'creep',
                    cells: ['Became urgent after create', String(figures.urgency_creep.count)],
                    value: figures.urgency_creep.count,
                  },
                ]}
              />
              <FigureBlock
                title="Throughput"
                columns={['Day', 'Completed']}
                rows={
                  figures.throughput.by_day.length > 0
                    ? figures.throughput.by_day.map((row) => ({
                        key: row.period,
                        cells: [row.period, String(row.count)],
                        value: row.count,
                      }))
                    : [{ key: 'total', cells: ['Total', String(figures.throughput.total)], value: figures.throughput.total }]
                }
              />
              <FigureBlock
                title="Estimates versus actuals"
                columns={['Task', 'Estimate (min)', 'Actual (sec)']}
                rows={figures.estimates_vs_actuals.rows.map((row) => ({
                  key: row.task_id,
                  cells: [row.task_id, String(row.effort_min), String(row.actual_sec)],
                  value: row.actual_sec,
                }))}
              />
              <FigureBlock
                title="Time spent"
                columns={['Task', 'Seconds']}
                rows={figures.time_spent.by_task.map((row) => ({
                  key: row.task_id,
                  cells: [row.task_id, String(row.seconds)],
                  value: row.seconds,
                }))}
              />
              <FigureBlock
                title="Waiting"
                columns={['Measure', 'Count']}
                rows={[
                  { key: 'waiting', cells: ['Waiting', String(figures.waiting.waiting)], value: figures.waiting.waiting },
                  {
                    key: 'overdue',
                    cells: ['Follow-up date is past', String(figures.waiting.overdue_follow_up)],
                    value: figures.waiting.overdue_follow_up,
                  },
                ]}
              />
              <FigureBlock
                title="Habits"
                columns={['Habit', 'Checks']}
                rows={figures.habits.by_habit.map((row) => ({
                  key: row.habit_id,
                  cells: [row.title, String(row.checks)],
                  value: row.checks,
                }))}
              />
              <FigureBlock
                title="Goals"
                columns={['Goal', 'Tasks']}
                rows={figures.goals.rows.map((row) => ({
                  key: row.goal_id,
                  cells: [row.title, String(row.tasks)],
                  value: row.tasks,
                }))}
              />
              <FigureBlock
                title="By person or organization"
                columns={['Name', 'Waiting on', 'For']}
                rows={figures.by_entity.rows.map((row) => ({
                  key: row.entity_id,
                  cells: [row.title, String(row.waiting_on), String(row.for)],
                  value: row.waiting_on + row.for,
                }))}
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
          ) : null}
        </QueryPanel>
      </div>
    </div>
  );
}
