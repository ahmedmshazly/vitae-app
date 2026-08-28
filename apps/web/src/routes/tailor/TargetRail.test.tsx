import '../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { TargetRail } from './TargetRail.js';
import type { Target } from './types.js';

function target(over: Partial<Target> = {}): Target {
  return {
    id: 'target-1',
    role_title: 'Staff Engineer',
    company: 'Northstar',
    status: 'active',
    deleted_at: null,
    parsed: {
      parser_version: 'v2',
      keywords: [{ term: 'kubernetes', weight: 2.5, skill_id: 'skill-1' }],
    },
    ...over,
  };
}

describe('TargetRail', () => {
  beforeEach(() => {
    resetMockApi();
  });

  it('shows a skeleton while the target list is in flight', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderWithApp(<TargetRail activeId={null} onSelect={() => {}} />);
    expect(screen.getByLabelText('Loading job targets')).toBeInTheDocument();
  });

  it('offers a retry when the target list fails to load', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('gateway timeout'));
    renderWithApp(<TargetRail activeId={null} onSelect={() => {}} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your job targets");
    expect(alert).toHaveTextContent('gateway timeout');

    mockApi.get.mockResolvedValue({ targets: [target()] });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: /Staff Engineer/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('points a first-time user at the form when there are no targets', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ targets: [] });
    renderWithApp(<TargetRail activeId={null} onSelect={() => {}} />);

    expect(await screen.findByText('No targets yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Paste a job description' }));

    expect(screen.getByLabelText('Job description')).toBeInTheDocument();
    expect(screen.queryByText('No targets yet')).not.toBeInTheDocument();
  });

  it('marks the open target with text as well as colour', async () => {
    mockApi.get.mockResolvedValue({
      targets: [target(), target({ id: 'target-2', role_title: 'Principal Engineer' })],
    });
    renderWithApp(<TargetRail activeId="target-2" onSelect={() => {}} />);

    const open = await screen.findByRole('button', { name: /Principal Engineer/ });
    expect(open).toHaveAttribute('aria-current', 'true');
    expect(open).toHaveTextContent('current');
    expect(screen.getByRole('button', { name: /Staff Engineer/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('summarises each row so the list reads without opening a target', async () => {
    mockApi.get.mockResolvedValue({
      targets: [target({ deleted_at: '2026-08-01T00:00:00.000Z', draft: { mode: 'auto' } })],
    });
    renderWithApp(<TargetRail activeId={null} onSelect={() => {}} />);

    const row = await screen.findByRole('button', { name: /Staff Engineer/ });
    expect(row).toHaveTextContent('Northstar · 1 keywords · draft saved · archived');
  });

  it('opens the target the user clicks', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockApi.get.mockResolvedValue({ targets: [target()] });
    renderWithApp(<TargetRail activeId={null} onSelect={onSelect} />);

    await user.click(await screen.findByRole('button', { name: /Staff Engineer/ }));
    expect(onSelect).toHaveBeenCalledWith('target-1');
  });

  it('says why a status change did not stick', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ targets: [target()] });
    mockApi.delete.mockRejectedValue(new Error('conflict'));
    renderWithApp(<TargetRail activeId="target-1" onSelect={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(screen.getByText("Couldn't update this target")).toBeInTheDocument();
    });
  });

  it('says the parser found nothing rather than showing an empty chip row', async () => {
    mockApi.get.mockResolvedValue({
      targets: [target({ parsed: { parser_version: 'v2', keywords: [] } })],
    });
    renderWithApp(<TargetRail activeId="target-1" onSelect={() => {}} />);

    expect(
      await screen.findByText(/The parser found no keywords in this description/),
    ).toBeInTheDocument();
  });
});
