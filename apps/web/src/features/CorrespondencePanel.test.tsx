/**
 * The correspondence panel: honest empties for missing direction data, figures
 * that decompose into named interactions, and a failure that says so.
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { CorrespondencePanel, type CorrespondenceProfileDto } from './CorrespondencePanel.js';

beforeEach(() => {
  resetMockApi();
});

const EMPTY_MONTHS = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, days: 0 }));

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
  it('says no direction was ever stated instead of computing a ratio of nothing', async () => {
    mockApi.get.mockResolvedValue({ profile: profile({ coverage: { withDirection: 0, total: 4 } }) });
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(await screen.findByText('No stated directions yet')).toBeInTheDocument();
    expect(screen.getByText(/None of the 4 logged interactions/)).toBeInTheDocument();
  });

  it('renders the figures and opens each into the interactions behind it', async () => {
    mockApi.get.mockResolvedValue({
      profile: profile({
        coverage: { withDirection: 3, total: 4 },
        reciprocity: { outbound: 2, inbound: 1, ratio: 0.67, outboundIds: ['i1', 'i3'], inboundIds: ['i2'] },
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
    expect(screen.getByText('3 of 4 interactions state a direction; the rest count as contact only.')).toBeInTheDocument();
    expect(screen.getByText('you 2 · them 1')).toBeInTheDocument();
    expect(screen.getByText('67% yours')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Reply latency'));
    expect(
      screen.getByText(/your reply in 2 days: 2026-08-01 · They wrote → 2026-08-03 · I answered/),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Contact days'));
    expect(screen.getByText('2026-12')).toBeInTheDocument();
  });

  it('reports a failed load as a failure', async () => {
    mockApi.get.mockRejectedValue(new Error('boom'));
    renderWithApp(<CorrespondencePanel personId="p1" />);
    expect(await screen.findByText('Correspondence unavailable')).toBeInTheDocument();
  });
});
