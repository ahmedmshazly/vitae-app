/**
 * Suggest tags: add from suggestion; commit typed token with Enter.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { SuggestTagInput } from './SuggestTagInput.js';

beforeEach(() => {
  resetMockApi();
});

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return <SuggestTagInput value={value} onChange={setValue} kind="topic" />;
}

describe('SuggestTagInput', () => {
  it('adds a tag from a suggestion hit', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'robotics', count: 2 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'rob');
    expect(await screen.findByRole('option', { name: /robotics/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /robotics/ }));
    // Chip + suggestion row can both show the label; assert the tag chip control.
    expect(screen.getByRole('button', { name: 'Remove robotics' })).toBeInTheDocument();
  });

  it('keeps a typed token when Enter adds free text', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'custom-topic{Enter}');
    await waitFor(() => {
      expect(screen.getByText('custom-topic')).toBeInTheDocument();
    });
  });
});
