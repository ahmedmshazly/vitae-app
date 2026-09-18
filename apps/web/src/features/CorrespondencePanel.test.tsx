/**
 * The correspondence panel: honest empties for missing direction data, figures
 * that decompose into named interactions, and a failure that says so.
 */
import './../test/api-mock.js';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { CorrespondencePanel, type CorrespondenceProfileDto } from './CorrespondencePanel.js';

beforeEach(() => {
  resetMockApi();
});

const EMPTY_MONTHS = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  days: 0,
}));

function profile(overrides: Partial<CorrespondenceProfileDto>): CorrespondenceProfileDto {
  return {
    coverage: { withDirection: 0, total: 0 },
    reciprocity: { outbound: 0, inbound: 0, ratio: null, outboundIds: [], inboundIds: [] },
    replyLatency: {
      mine: { medianDays: null, samples: [] },
      theirs: { medianDays: null, samples: [] },
    },
    unansweredInbound: { count: 0, eventIds: [] },
    contactDays: { totalDays: 0, months: EMPTY_MONTHS },
    ...overrides,
  };
}

describe('CorrespondencePanel (FR-COMM-001)', () => {
  it('does not erase known history when correspondence has no eligible measurements', async () => {
    mockApi.get.mockResolvedValue({ profile: profile({}) });
    renderWithApp(
      <CorrespondencePanel
        personId="p1"
        interactions={[{ id: 'undated', title: 'Imported conversation', at: '' }]}
      />,
    );
    expect(await screen.findByText('No correspondence measurements yet')).toBeVisible();
    expect(screen.queryByText('No interactions logged')).not.toBeInTheDocument();
    expect(screen.getByText(/missing dates and directions are not guessed/)).toBeVisible();
  });

  it('says no direction was ever stated instead of computing a ratio of nothing', async () => {
    mockApi.get.mockResolvedValue({
      profile: profile({ coverage: { withDirection: 0, total: 4 } }),
    });
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(await screen.findByText('No stated directions yet')).toBeInTheDocument();
    expect(screen.getByText(/None of the 4 logged interactions/)).toBeInTheDocument();
  });

  it('renders the figures and opens each into the interactions behind it', async () => {
    mockApi.get.mockResolvedValue({
      profile: profile({
        coverage: { withDirection: 3, total: 4 },
        reciprocity: {
          outbound: 2,
          inbound: 1,
          ratio: 0.67,
          outboundIds: ['i1', 'i3'],
          inboundIds: ['i2'],
        },
        replyLatency: {
          mine: { medianDays: 2, samples: [{ fromId: 'i2', toId: 'i3', days: 2 }] },
          theirs: { medianDays: null, samples: [] },
        },
        unansweredInbound: { count: 0, eventIds: [] },
        contactDays: {
          totalDays: 3,
          months: [...EMPTY_MONTHS.slice(0, 11), { month: '2026-12', days: 3 }],
        },
      }),
    });
    renderWithApp(
      <CorrespondencePanel
        personId="p1"
        interactions={[
          { id: 'i2', title: 'They wrote', at: '2026-08-01T10:00:00Z' },
          { id: 'i3', title: 'I answered', at: '2026-08-03T10:00:00Z' },
        ]}
      />,
    );

    expect(await screen.findByText('Reciprocity')).toBeInTheDocument();
    expect(
      screen.getByText('3 of 4 interactions state a direction; the rest count as contact only.'),
    ).toBeInTheDocument();
    expect(screen.getByText('you 2 · them 1')).toBeInTheDocument();
    expect(screen.getByText('67% yours')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Reply latency'));
    const pairs = screen.getByRole('list', { name: 'Reply pairs' });
    expect(within(pairs).getByText('Your reply in 2 days')).toBeInTheDocument();
    expect(within(pairs).getByRole('link', { name: '2026-08-01 · They wrote' })).toHaveAttribute(
      'href',
      '/n/i2',
    );
    expect(within(pairs).getByRole('link', { name: '2026-08-03 · I answered' })).toHaveAttribute(
      'href',
      '/n/i3',
    );

    await user.click(screen.getByText('Contact days'));
    expect(screen.getByText('2026-12')).toBeInTheDocument();
  });

  it('reports a failed load as a failure', async () => {
    mockApi.get.mockRejectedValue(new Error('boom'));
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(await screen.findByText('Correspondence unavailable')).toBeInTheDocument();
  });

  it('labels loading and recovers an absent profile without implying empty history', async () => {
    mockApi.get.mockResolvedValueOnce({}).mockResolvedValue({ profile: profile({}) });
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(screen.getByRole('status', { name: 'Loading correspondence' })).toBeInTheDocument();
    await screen.findByText('Correspondence unavailable');
    expect(screen.queryByText('No interactions logged')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry correspondence' }));
    expect(await screen.findByText('No interactions logged')).toBeInTheDocument();
  });

  it('retains cached figures and open evidence when refresh fails, then recovers', async () => {
    const data = {
      profile: profile({
        coverage: { total: 1, withDirection: 1 },
        unansweredInbound: { count: 1, eventIds: ['i1'] },
      }),
    };
    mockApi.get.mockResolvedValue(data);
    const { queryClient } = renderWithApp(<CorrespondencePanel personId="p1" />);
    await userEvent.click(await screen.findByText('Unanswered inbound'));
    mockApi.get.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['person-correspondence', 'p1'] });
    });
    expect(await screen.findByText('Correspondence could not be refreshed')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Unanswered inbound interactions' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Interaction i1' })).toHaveAttribute('href', '/n/i1');
    mockApi.get.mockResolvedValue(data);
    await userEvent.click(screen.getByRole('button', { name: 'Retry correspondence' }));
    await act(async () => {
      await queryClient.cancelQueries();
    });
    expect(await screen.findByText('Reciprocity')).toBeInTheDocument();
  });

  it('bounds each disclosure independently and links introductions without directional history', async () => {
    mockApi.get.mockResolvedValue({
      profile: profile({}),
      introductions: {
        connected: Array.from({ length: 21 }, (_, i) => ({
          edgeId: `e${i}`,
          otherId: `p${i}`,
          otherTitle: `Person ${i}`,
          viaId: 'broker',
          viaLabel: 'Morgan',
          occurredOn: null,
          context: null,
        })),
        brokered: [],
      },
    });
    renderWithApp(<CorrespondencePanel personId="p1" />);
    await userEvent.click(await screen.findByText('Introductions'));
    const list = screen.getByRole('list', { name: 'Recorded introductions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(within(list).getByRole('link', { name: 'Person 0' })).toHaveAttribute(
      'href',
      '/network/people/p0',
    );
    expect(within(list).getAllByRole('link', { name: 'Morgan' })[0]).toHaveAttribute(
      'href',
      '/network/people/broker',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show more introductions' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(21);
    await userEvent.click(screen.getByRole('button', { name: 'Show first 20 introductions' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByText('No interactions logged')).toBeInTheDocument();
  });

  it('does not turn missing or non-finite reply measurements into zero', async () => {
    mockApi.get.mockResolvedValue({
      profile: profile({
        coverage: { total: 1, withDirection: 1 },
        replyLatency: {
          mine: { medianDays: NaN, samples: [] },
          theirs: { medianDays: 1, samples: [] },
        },
      }),
    });
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(await screen.findByText('you Not enough data')).toBeInTheDocument();
    expect(screen.getByText('them 1 day')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
