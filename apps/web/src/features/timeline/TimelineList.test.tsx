/**
 * Timeline list: empty, year groups, moment filter, select.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import { TimelineList } from './TimelineList.js';
import type { TimelineLane } from './types.js';

const lanes: TimelineLane[] = [
  {
    name: 'Roles',
    items: [
      {
        id: 'r1',
        type: 'role',
        title: 'Engineer',
        subtitle: null,
        start: '2020-01-01',
        end: '2021-06-01',
        current: false,
        kind: 'span',
      },
    ],
  },
  {
    name: 'Events',
    items: [
      {
        id: 'e1',
        type: 'event',
        title: 'Talk',
        subtitle: null,
        start: '2020-05-01',
        end: null,
        current: false,
        kind: 'moment',
      },
    ],
  },
];

describe('TimelineList', () => {
  it('shows empty copy when nothing dated is active', () => {
    renderWithApp(
      <TimelineList
        lanes={lanes}
        activeLanes={[]}
        showMoments
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Nothing dated yet')).toBeInTheDocument();
  });

  it('groups by year, hides moments when asked, and selects a row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithApp(
      <TimelineList
        lanes={lanes}
        activeLanes={['Roles', 'Events']}
        showMoments={false}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('heading', { name: '2020' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Talk')).not.toBeInTheDocument();
    await user.click(screen.getByText('Engineer'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });
});
