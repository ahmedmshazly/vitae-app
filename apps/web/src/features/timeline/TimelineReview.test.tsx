/**
 * Season review dock states and markdown export shape.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { reviewToMarkdown, TimelineReviewDock } from './TimelineReview.js';
import type { TimelineReviewResult } from './types.js';

const review: TimelineReviewResult = {
  from: '2020-01-01',
  to: '2020-12-31',
  label: '2020',
  summary: { roles: 1, events: 0 },
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

describe('reviewToMarkdown', () => {
  it('builds a headed markdown digest', () => {
    const md = reviewToMarkdown(review);
    expect(md).toContain('# 2020');
    expect(md).toContain('Period: 2020-01-01 → 2020-12-31');
    expect(md).toContain('## Roles (1)');
    expect(md).toContain('- Engineer: Acme (2020-01-01 → 2020-12-31)');
  });
});

describe('TimelineReviewDock', () => {
  it('surfaces a failed digest as an alert', () => {
    renderWithApp(
      <TimelineReviewDock
        review={undefined}
        loading={false}
        failed
        onClear={() => {}}
        onExportMarkdown={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t summarise that range/);
  });

  it('enables Export Markdown when the review has sections', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderWithApp(
      <TimelineReviewDock
        review={review}
        loading={false}
        onClear={() => {}}
        onExportMarkdown={onExport}
      />,
    );
    const exportBtn = screen.getByRole('button', { name: 'Export Markdown' });
    expect(exportBtn).toBeEnabled();
    await user.click(exportBtn);
    expect(onExport).toHaveBeenCalled();
  });
});
