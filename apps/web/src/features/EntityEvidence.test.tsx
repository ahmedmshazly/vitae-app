import './../test/api-mock.js';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { EntityEvidence } from './EntityEvidence.js';

const assertion = (id = 'a1') => ({
  id,
  field: 'props.headline',
  value: 'Researcher',
  status: 'accepted',
  basis: 'explicit',
  confidence: 0.9,
  valid_from: null,
  reason: 'Stated in the source signature.',
  citation: {
    locator: 'mailbox:thread/message-1',
    excerpt: 'I lead the research team.',
    record_id: 'source-record-1',
  },
});
beforeEach(resetMockApi);

it('labels loading, distinguishes failed data from empty and retries', async () => {
  mockApi.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ assertions: [] });
  renderWithApp(<EntityEvidence entityId="p1" />);
  expect(screen.getByRole('status', { name: 'Loading source evidence' })).toBeInTheDocument();
  await screen.findByText('Evidence unavailable');
  expect(
    screen.queryByText('No source assertions support this record yet.'),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry evidence' }));
  expect(
    await screen.findByText('No source assertions support this record yet.'),
  ).toBeInTheDocument();
});

it('does not treat a missing assertions collection as a successful empty result', async () => {
  mockApi.get.mockResolvedValue({});
  renderWithApp(<EntityEvidence entityId="p1" />);
  expect(await screen.findByText('Evidence unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry evidence' })).toBeEnabled();
});

it('discloses source metadata without confusing source IDs with entity links', async () => {
  mockApi.get.mockResolvedValue({
    assertions: [assertion()],
    records: {
      'source-record-1': {
        title: 'Research workshop follow-up',
        kind: 'message',
        direction: 'in',
        occurred_at: null,
        locator: 'mailbox:thread/message-1',
      },
    },
  });
  renderWithApp(<EntityEvidence entityId="p1" />);
  await userEvent.click(await screen.findByText('Source details'));
  expect(screen.getByText('Research workshop follow-up')).toBeVisible();
  expect(screen.getByText('Inbound')).toBeVisible();
  expect(screen.getByText('Not recorded')).toBeVisible();
  expect(screen.getByText('Stated in the source signature.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open knowledge ledger' })).toHaveAttribute(
    'href',
    '/data/knowledge',
  );
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('keeps cached evidence and source disclosure open after a failed refresh', async () => {
  const data = { assertions: [assertion()], records: {} };
  mockApi.get.mockResolvedValue(data);
  const { queryClient } = renderWithApp(<EntityEvidence entityId="p1" />);
  await userEvent.click(await screen.findByText('Source details'));
  mockApi.get.mockRejectedValue(new Error('offline'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['entity-evidence', 'p1'] });
  });
  expect(await screen.findByText('Evidence could not be refreshed')).toBeInTheDocument();
  expect(
    screen.getByText('Source metadata is unavailable. The citation above is retained.'),
  ).toBeVisible();
  expect(screen.getByText('“I lead the research team.”')).toBeVisible();
  mockApi.get.mockResolvedValue(data);
  await userEvent.click(screen.getByRole('button', { name: 'Retry evidence' }));
  await waitFor(() =>
    expect(screen.queryByText('Evidence could not be refreshed')).not.toBeInTheDocument(),
  );
});

it('bounds long registers and resets disclosure when the entity changes', async () => {
  mockApi.get.mockResolvedValue({
    assertions: Array.from({ length: 23 }, (_, i) => assertion(`a${i}`)),
  });
  const { rerender } = renderWithApp(<EntityEvidence entityId="p1" />);
  const list = await screen.findByRole('list', { name: 'Evidence supporting this record' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(20);
  await userEvent.click(screen.getByRole('button', { name: 'Show more evidence' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(23);
  await userEvent.click(screen.getByRole('button', { name: 'Show first 20 assertions' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(20);
  await userEvent.click(screen.getByRole('button', { name: 'Show more evidence' }));
  rerender(<EntityEvidence entityId="p2" />);
  const next = await screen.findByRole('list', { name: 'Evidence supporting this record' });
  expect(within(next).getAllByRole('listitem')).toHaveLength(20);
});
