import '../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Composer } from './Composer.js';

const access = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', () => ({
  useCanWrite: () => access.canWrite,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
const ctx = { personId: 'p1', personName: 'Ada Chen', kind: 'referral' as const };
beforeEach(() => {
  resetMockApi();
  access.canWrite = true;
  mockApi.post.mockResolvedValue({ body: 'Hello Ada.', facts: ['Discussed research'] });
});
it('requires confirmation that outreach happened, and freezes a single logging request', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  mockApi.post.mockImplementation((path: string) =>
    path.endsWith('/draft')
      ? Promise.resolve({ body: 'Hello Ada.', facts: [] })
      : new Promise(() => {}),
  );
  renderWithApp(<Composer ctx={ctx} onClose={close} />);
  const editor = await screen.findByLabelText('Draft message');
  expect(screen.getByRole('button', { name: 'Log outreach & follow-up' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  await user.dblClick(screen.getByRole('button', { name: 'Log outreach & follow-up' }));
  expect(mockApi.post.mock.calls.filter(([path]) => path === '/composer/send')).toHaveLength(1);
  expect(editor).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
});
it('protects edited text on Escape and before regeneration, retaining it after failure', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  renderWithApp(<Composer ctx={ctx} onClose={close} />);
  await user.type(await screen.findByLabelText('Draft message'), ' My own context.');
  await user.keyboard('{Escape}');
  const discard = await screen.findByRole('dialog', { name: 'Discard changes?' });
  expect(within(discard).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  await user.click(within(discard).getByRole('button', { name: 'Keep editing' }));
  await user.click(screen.getByRole('button', { name: 'formal' }));
  expect(mockApi.post).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Regenerate' }));
  const replace = screen.getByRole('dialog', { name: 'Replace your edited draft?' });
  expect(within(replace).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  mockApi.post.mockRejectedValueOnce(new Error(''));
  await user.click(within(replace).getByRole('button', { name: 'Replace draft' }));
  await screen.findByText("Couldn't regenerate the draft");
  expect(screen.getByLabelText('Draft message')).toHaveValue('Hello Ada. My own context.');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  expect(close).not.toHaveBeenCalled();
});
it('resets all draft state when only the target changes', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const view = renderWithApp(<Composer ctx={{ ...ctx, targetOrgId: 'o1' }} onClose={close} />);
  await user.type(await screen.findByLabelText('Draft message'), ' Edited.');
  await user.click(screen.getByRole('button', { name: 'formal' }));
  mockApi.post.mockResolvedValueOnce({ body: 'New target draft.', facts: [] });
  view.rerender(<Composer ctx={{ ...ctx, targetOrgId: 'o2' }} onClose={close} />);
  await waitFor(() =>
    expect(screen.getByLabelText('Draft message')).toHaveValue('New target draft.'),
  );
  expect(screen.getByRole('button', { name: 'warm' })).toHaveAttribute('aria-pressed', 'true');
  expect(mockApi.post).toHaveBeenLastCalledWith(
    '/composer/draft',
    expect.objectContaining({ targetOrgId: 'o2', tone: 'warm' }),
  );
});
it('allows editing and copying but not logging in a read-only workspace', async () => {
  access.canWrite = false;
  renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
  expect(await screen.findByLabelText('Draft message')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Log outreach & follow-up' })).toBeDisabled();
  expect(screen.getByText(/You can still edit and copy/)).toBeInTheDocument();
});
it('treats a blank or malformed generated draft as a recoverable failure', async () => {
  mockApi.post.mockResolvedValue({ body: ' ', facts: [] });
  renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
  expect(await screen.findByText("Couldn't draft that message")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
});
