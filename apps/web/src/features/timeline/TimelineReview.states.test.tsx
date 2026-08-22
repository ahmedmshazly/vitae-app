/**
 * The season review's four states. Two of them, the paused digest and the
 * empty window, used to render as the panel's own idle header.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { TimelineReviewDock } from './TimelineReview.js';
import type { TimelineReviewResult } from './types.js';

const review: TimelineReviewResult = {
  from: '2019-08-01',
  to: '2021-03-31',
  label: '2020',
  summary: { roles: 1 },
  sections: [
    {
      key: 'roles',
      title: 'Roles',
      count: 1,
      items: [
        {
          id: 'r1',
          type: 'role',
          title: 'Engineer',
          subtitle: 'Acme',
          start: '2020-01-01',
          end: '2020-12-31',
        },
      ],
    },
  ],
};

function dock(over: Partial<Parameters<typeof TimelineReviewDock>[0]> = {}) {
  return renderWithApp(
    <TimelineReviewDock
      review={review}
      loading={false}
      onClear={() => {}}
      onExportMarkdown={() => {}}
      {...over}
    />,
  );
}

describe('TimelineReviewDock states', () => {
  it('states the range it read instead of asking for the range it has', () => {
    dock();
    expect(screen.getByText('2019-08-01 → 2021-03-31')).toBeInTheDocument();
    expect(screen.queryByText('Brush a range on the chronograph')).not.toBeInTheDocument();
  });

  it('reports a digest that has not arrived rather than an empty panel', () => {
    dock({ review: undefined, loading: false, failed: false });
    expect(screen.getByRole('status')).toHaveTextContent('Reading this season');
  });

  it('offers a way out of an empty window', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    dock({ review: { ...review, sections: [] }, onClear });
    expect(screen.getByText('Nothing dated in this window')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear brush' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('opens each section from a control that reports its own state', async () => {
    const user = userEvent.setup();
    dock();
    const trigger = screen.getByRole('button', { name: 'Roles' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('still announces a failed digest as an alert', () => {
    dock({ review: undefined, failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t summarise that range/);
  });
});
