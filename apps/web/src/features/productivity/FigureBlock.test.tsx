import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { FigureBlock } from './FigureBlock.js';

describe('Analytics figure', () => {
  it('discloses bounded rows and keeps chart and table in sync', async () => {
    renderWithApp(
      <FigureBlock
        title="Time spent"
        columns={['Task', 'Time']}
        chartLabel="Recorded time"
        rows={Array.from({ length: 21 }, (_, i) => ({
          key: String(i),
          cells: [`Task ${i}`, `${i}m`],
          value: i * 60,
          valueLabel: `${i}m`,
          href: `/n/task-${i}`,
        }))}
      />,
    );
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(21);
    expect(screen.getByRole('list', { name: 'Time spent chart' })).not.toBeVisible();
    await userEvent.click(screen.getByText('Compare time spent'));
    expect(
      within(screen.getByRole('list', { name: 'Time spent chart' })).getAllByRole('listitem'),
    ).toHaveLength(20);
    await userEvent.click(screen.getByRole('button', { name: 'Show more time spent' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(22);
    expect(
      within(screen.getByRole('list', { name: 'Time spent chart' })).getAllByRole('listitem'),
    ).toHaveLength(21);
    expect(screen.getByRole('link', { name: 'Task 20' })).toHaveAttribute('href', '/n/task-20');
    expect(screen.getByText('Showing 21 of 21 rows')).toBeInTheDocument();
  });
  it('replaces an empty table and chart with a specific explanation', () => {
    renderWithApp(
      <FigureBlock
        title="Habits"
        columns={['Habit', 'Checks']}
        rows={[]}
        emptyHint="No checks in this period."
      />,
    );
    expect(screen.getByText('No checks in this period.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Compare habits')).not.toBeInTheDocument();
  });
});
