import '../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { Tailor } from './Tailor.js';

vi.mock('./TargetRail.js', () => ({
  TargetRail: () => <aside aria-label="Job targets" />,
}));

vi.mock('./DocumentPane.js', () => ({
  DocumentPane: ({ onDraft }: { onDraft: (patch: { headline: string }) => void }) => (
    <button type="button" onClick={() => onDraft({ headline: 'Focused résumé' })}>
      Change headline
    </button>
  ),
}));

vi.mock('./SelectionPane.js', () => ({
  SelectionPane: () => <div>Selection controls</div>,
}));

vi.mock('./PreviewPane.js', () => ({
  PreviewPane: () => <div>Preview controls</div>,
}));

describe('Tailor', () => {
  beforeEach(() => {
    resetMockApi();
    mockApi.get.mockResolvedValue({
      targets: [
        {
          id: 'target-1',
          role_title: 'Staff Engineer',
          parsed: { parser_version: 'v1', keywords: [] },
        },
      ],
      atoms: [],
    });
    mockApi.post.mockResolvedValue({
      scores: [],
      selection: { entries: [], totalLines: 0, weightedCoverage: 0 },
      pageEstimate: { lines: 0, budget: 50, pages: 1, fill: 0 },
    });
  });

  it('offers a retry that saves the current draft after an autosave failure', async () => {
    const user = userEvent.setup();
    mockApi.patch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    renderWithApp(<Tailor />, { route: '/career/tailor?target=target-1' });

    await screen.findByRole('button', { name: 'Change headline' });
    await user.click(screen.getByRole('button', { name: 'Change headline' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not saving.');
    expect(mockApi.patch).toHaveBeenLastCalledWith('/targets/target-1/draft', {
      draft: expect.objectContaining({ headline: 'Focused résumé' }),
    });

    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(await screen.findByText('draft saved')).toBeInTheDocument();
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledTimes(2));
  });
});
