import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { PersonFavors } from './PersonFavors.js';

beforeEach(() => resetMockApi());

it('owns save and settlement errors without invoking the global fallback', async () => {
  const fallback = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.options.onError) fallback(error);
      },
    }),
  });
  mockApi.post.mockRejectedValue(new Error('Save interrupted'));
  mockApi.patch.mockRejectedValue(new Error('Settlement interrupted'));
  renderWithApp(
    <PersonFavors
      personId="p1"
      favors={[{ id: 'a', direction: 'owed_to_me', what: 'Existing favor' }]}
      hasRelationship
    />,
    { queryClient },
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Favor description'), 'Research review');
  await user.click(screen.getByRole('button', { name: 'They owe' }));
  expect(await screen.findByText('Favor save not confirmed')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Settle' }));
  expect(await screen.findByText('Settlement not confirmed')).toBeVisible();
  expect(fallback).not.toHaveBeenCalled();
});

it('retries the exact favor request and keeps the description until success', async () => {
  const user = userEvent.setup();
  mockApi.post.mockRejectedValueOnce(new Error('Response interrupted')).mockResolvedValueOnce({});
  renderWithApp(<PersonFavors personId="p1" favors={[]} hasRelationship />);
  await user.type(screen.getByLabelText('Favor description'), 'Research review');
  await user.click(screen.getByRole('button', { name: 'They owe' }));
  expect(await screen.findByText('Favor save not confirmed')).toBeVisible();
  expect(screen.getByLabelText('Favor description')).toHaveValue('Research review');
  expect(screen.getByLabelText('Favor description')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Retry favor' }));
  await waitFor(() => expect(screen.getByLabelText('Favor description')).toHaveValue(''));
  expect(mockApi.post).toHaveBeenCalledTimes(2);
  expect(mockApi.post.mock.calls[0]).toEqual(mockApi.post.mock.calls[1]);
  expect(mockApi.post.mock.calls[0]?.[2]).toEqual({ idempotencyKey: expect.any(String) });
});

it('guards a drafted commitment before discarding it', async () => {
  const user = userEvent.setup();
  renderWithApp(<PersonFavors personId="p1" favors={[]} hasRelationship />);
  await user.type(screen.getByLabelText('Favor description'), 'Research review');
  await user.click(screen.getByRole('button', { name: 'Discard draft' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Favor description')).toHaveValue('Research review');
  await user.click(screen.getByRole('button', { name: 'Discard draft' }));
  await user.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.getByLabelText('Favor description')).toHaveValue('');
});

it('queues different settlements and prevents duplicate clicks on either row', async () => {
  const user = userEvent.setup();
  let finish!: (value: unknown) => void;
  mockApi.patch
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({});
  renderWithApp(
    <PersonFavors
      personId="p1"
      favors={[
        { id: 'a', direction: 'owed_by_me', what: 'First' },
        { id: 'b', direction: 'owed_to_me', what: 'Second' },
      ]}
      hasRelationship
    />,
  );
  const rows = within(screen.getByRole('list', { name: 'Favors' })).getAllByRole('listitem');
  await user.click(within(rows[0]!).getByRole('button', { name: 'Settle' }));
  await user.click(within(rows[1]!).getByRole('button', { name: 'Settle' }));
  expect(mockApi.patch).toHaveBeenCalledTimes(1);
  expect(within(rows[0]!).getByRole('button', { name: 'Settling...' })).toBeDisabled();
  expect(within(rows[1]!).getByRole('button', { name: 'Settling...' })).toBeDisabled();
  finish({});
  await waitFor(() => expect(mockApi.patch).toHaveBeenCalledTimes(2));
  expect(mockApi.patch.mock.calls[1]?.[0]).toBe('/people/p1/favors/b');
});

it('explains a missing relationship instead of offering a failing action', () => {
  renderWithApp(<PersonFavors personId="p1" favors={[]} hasRelationship={false} />);
  expect(screen.getByText(/Connect this person to your own record/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'They owe' })).not.toBeInTheDocument();
});
