/**
 * Entity picker: search/switch hits and onPick.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { EntityPicker } from './EntityPicker.js';

beforeEach(() => {
  resetMockApi();
});

describe('EntityPicker', () => {
  it('searches switch results and calls onPick when a hit is chosen', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mockApi.get.mockResolvedValue({
      results: [{ id: 'p1', type: 'person', title: 'Ada Lovelace', subtitle: 'Analyst' }],
    });

    renderWithApp(
      <EntityPicker types={['person']} onPick={onPick} placeholder="Search people…" />,
    );

    const input = screen.getByRole('combobox', { name: 'Search people…' });
    await user.type(input, 'Ada');

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('/search/switch?'));
    });
    expect(await screen.findByRole('option', { name: /Ada Lovelace/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Ada Lovelace/ }));
    expect(onPick).toHaveBeenCalledWith({ id: 'p1', type: 'person', title: 'Ada Lovelace' });
  });

  it('narrows by type with a pressed state rather than by colour', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ results: [] });

    renderWithApp(<EntityPicker types={['person', 'organization']} onPick={vi.fn()} />);

    const org = screen.getByRole('button', { name: 'organization' });
    expect(org).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(org);
    expect(org).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByRole('combobox'), 'Nile');
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('types=organization'));
    });
  });

  it('says the search is unavailable instead of looking like no matches', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValue(new Error('switch is down'));

    renderWithApp(<EntityPicker types={['person']} onPick={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'Ada');

    expect(await screen.findByText('Search is unavailable')).toBeInTheDocument();
    expect(screen.getByText('switch is down')).toBeInTheDocument();
    // The way forward is still offered: a dead search does not block creating.
    expect(screen.getByRole('option', { name: /Create person/ })).toBeInTheDocument();
  });

  it('reports a failed create where the row was clicked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mockApi.get.mockResolvedValue({ results: [] });
    mockApi.post.mockRejectedValue(new Error('title already taken'));

    renderWithApp(<EntityPicker types={['person']} onPick={onPick} />);
    await user.type(screen.getByRole('combobox'), 'Ada');
    await user.click(await screen.findByRole('option', { name: /Create person/ }));

    expect(await screen.findByText('Nothing was created')).toBeInTheDocument();
    expect(screen.getByText('title already taken')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('waits for the search before offering to create what it might find', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    let answer: ((value: unknown) => void) | null = null;
    mockApi.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    renderWithApp(<EntityPicker types={['person']} onPick={onPick} />);
    await user.type(screen.getByRole('combobox'), 'Ada');
    await waitFor(() => expect(answer).not.toBeNull());

    // While the lookup is out there is no list, so Enter has nothing to commit.
    // It used to have exactly one row, "Create person", and pressing Enter on a
    // slow connection wrote a second Ada rather than finding the first.
    expect(screen.queryByRole('option')).toBeNull();
    await user.keyboard('{Enter}');
    expect(mockApi.post).not.toHaveBeenCalled();

    answer!({ results: [{ id: 'p1', type: 'person', title: 'Ada Lovelace' }] });
    await screen.findByRole('option', { name: /Ada Lovelace/ });
    await user.keyboard('{Enter}');

    expect(onPick).toHaveBeenCalledWith({ id: 'p1', type: 'person', title: 'Ada Lovelace' });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('says a search with no hits found nothing, and what to do next', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ results: [] });

    renderWithApp(<EntityPicker types={['person']} onPick={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'Zzz');

    expect(await screen.findByText(/No match for/)).toBeInTheDocument();
  });
});
