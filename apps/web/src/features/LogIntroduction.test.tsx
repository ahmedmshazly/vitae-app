/**
 * The introduction recorder (FR-COMM-003): what it writes, what it refuses to
 * write without a broker, and how it reports a favor-ledger failure without
 * hiding that the introduction itself was recorded.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { LogIntroduction } from './LogIntroduction.js';

beforeEach(() => {
  resetMockApi();
});

function mockSelfAndSearch() {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/auth/me')) return { self: { id: 'self-1', title: 'Me' } };
    if (path.startsWith('/search/switch'))
      return { results: [{ id: 'p9', type: 'person', title: 'Nadia Broker' }] };
    return {};
  });
}

async function pickBroker(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Who made the introduction?'), 'Nadia');
  await user.click(await screen.findByRole('option', { name: /Nadia Broker/ }));
}

describe('LogIntroduction', () => {
  it('refuses to save without a broker, then writes the INTRODUCED edge with the broker credited', async () => {
    mockSelfAndSearch();
    mockApi.post.mockResolvedValue({ edge: { id: 'e1' } });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithApp(
      <LogIntroduction open onOpenChange={onOpenChange} personId="p1" personName="Ada" />,
    );

    expect(screen.getByRole('button', { name: 'Save introduction' })).toBeDisabled();
    await pickBroker(user);
    await user.click(screen.getByRole('button', { name: 'Save introduction' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/edges',
        expect.objectContaining({
          type: 'INTRODUCED',
          src: 'self-1',
          dst: 'p1',
          props: expect.objectContaining({ via: 'p9' }),
        }),
      );
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("credits the broker's favor ledger when asked, in the same gesture", async () => {
    mockSelfAndSearch();
    mockApi.post.mockResolvedValue({ edge: { id: 'e1' } });
    const user = userEvent.setup();
    renderWithApp(
      <LogIntroduction open onOpenChange={vi.fn()} personId="p1" personName="Ada" />,
    );

    await pickBroker(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save introduction' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/people/p9/favors',
        expect.objectContaining({ direction: 'owed_by_me', what: 'Introduced me to Ada' }),
        { idempotencyKey: expect.any(String) },
      );
    });
  });

  it('reports a favor failure while standing by the recorded introduction', async () => {
    mockSelfAndSearch();
    mockApi.post.mockImplementation(async (path: string) => {
      if (path === '/edges') return { edge: { id: 'e1' } };
      throw new Error('no relationship record');
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithApp(
      <LogIntroduction open onOpenChange={onOpenChange} personId="p1" personName="Ada" />,
    );

    await pickBroker(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save introduction' }));

    expect(await screen.findByText('Introduction saved · favor needs review')).toBeInTheDocument();
    expect(screen.getByText(/The introduction is recorded, but the favor could not be confirmed/)).toBeInTheDocument();
    // The dialog stays open so the report is read, not flashed past.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Retry favor only' })).toBeEnabled();
    expect(screen.getByLabelText('Context')).toBeDisabled();
    mockApi.post.mockResolvedValue({});
    await user.click(screen.getByRole('button', { name: 'Retry favor only' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/edges')).toHaveLength(1);
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/people/p9/favors')).toHaveLength(2);
    const attempts = mockApi.post.mock.calls.filter(([path]) => path === '/people/p9/favors');
    expect(attempts[0]?.[2]).toEqual(attempts[1]?.[2]);
  });

  it('keeps a draft through cancellation and freezes it during a save', async () => {
    mockSelfAndSearch();
    let finish!: (value: unknown) => void;
    mockApi.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithApp(<LogIntroduction open onOpenChange={onOpenChange} personId="p1" personName="Ada" />);
    await pickBroker(user);
    await user.type(screen.getByLabelText('Context'), 'Shared research');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Context')).toHaveValue('Shared research');
    await user.click(screen.getByRole('button', { name: 'Save introduction' }));
    expect(screen.getByLabelText('Context')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving...' }));
    expect(mockApi.post).toHaveBeenCalledOnce();
    finish({ edge: { id: 'e1' } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('explains a missing self record and prevents a write', async () => {
    mockApi.get.mockResolvedValue({ self: null });
    renderWithApp(<LogIntroduction open onOpenChange={vi.fn()} personId="p1" personName="Ada" />);
    expect(await screen.findByText('Identify your person record first')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save introduction' })).toBeDisabled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
