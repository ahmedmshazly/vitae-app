/**
 * Suggest text: debounced suggest fetch, pick hit, free text still wins.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { SuggestTextInput } from './SuggestTextInput.js';

beforeEach(() => {
  resetMockApi();
});

function Harness() {
  const [value, setValue] = useState('');
  return (
    <SuggestTextInput
      value={value}
      onChange={setValue}
      source={{ mode: 'prop', type: 'organization', prop: 'industry' }}
      propKey="industry"
      aria-label="Industry"
    />
  );
}

describe('SuggestTextInput', () => {
  it('fetches suggestions and applies a picked hit', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'FinTech', count: 3 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Industry' });
    await user.type(input, 'Fin');

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/suggest/values?'),
      );
    });
    expect(await screen.findByRole('option', { name: /FinTech/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /FinTech/ }));
    expect(input).toHaveValue('FinTech');
  });

  it('keeps free text when the user does not pick a suggestion', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'FinTech', count: 1 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Industry' });
    await user.type(input, 'CustomIndustry');
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });
    expect(input).toHaveValue('CustomIndustry');
  });
});
