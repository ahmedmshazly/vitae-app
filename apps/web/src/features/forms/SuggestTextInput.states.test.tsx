/**
 * The scalar sibling of SuggestTagInput, and the same two silences: a suggest
 * endpoint that is down looked exactly like a graph holding no match, and a
 * rejected stub create looked exactly like a successful one, because in both
 * cases nothing at all moved.
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

/** `company` maps to an organization, so a typed value can become a record. */
function Harness() {
  const [value, setValue] = useState('');
  return (
    <SuggestTextInput
      value={value}
      onChange={setValue}
      source={{ mode: 'prop', type: 'role', prop: 'company' }}
      propKey="company"
      aria-label="Company"
    />
  );
}

describe('SuggestTextInput reports what it could not do', () => {
  it('says the lookup failed instead of behaving like a plain text box', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValue(new Error('suggest is down'));
    renderWithApp(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'Acme');

    expect(await screen.findByText('Search failed.')).toBeInTheDocument();
    expect(screen.getByText('suggest is down')).toBeInTheDocument();
  });

  it('says nothing was created when the stub create is rejected', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    mockApi.post.mockRejectedValue(new Error('name is taken'));
    renderWithApp(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'Acme');
    await user.click(await screen.findByRole('option', { name: /Create organization/ }));

    expect(await screen.findByText('Nothing was created')).toBeInTheDocument();
    expect(screen.getByText('name is taken')).toBeInTheDocument();
  });

  it('names the record it minted, because the typed value looks the same either way', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    mockApi.post.mockResolvedValue({ node: { id: 'n1' } });
    renderWithApp(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'Acme');
    await user.click(await screen.findByRole('option', { name: /Create organization/ }));

    expect(await screen.findByText('Created')).toBeInTheDocument();
    expect(screen.getByText("organization 'Acme'")).toBeInTheDocument();
    // Still offering to create it would mint the duplicate this field exists
    // to prevent, and the focus returning to the input reopens the list.
    expect(screen.queryByRole('option', { name: /Create organization/ })).not.toBeInTheDocument();
  });
});

describe('SuggestTextInput will not mint a duplicate', () => {
  it('offers no create option for a name the graph already holds', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'Acme', count: 4 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Company' });
    await user.type(input, 'Acm');
    await screen.findByRole('option', { name: /Acme/ });

    await user.type(input, 'e');
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /Acme/ })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /Create organization/ })).not.toBeInTheDocument();
  });

  it('still offers create for a name that only looks close', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'Acme', count: 4 }] });
    renderWithApp(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'Acme Labs');

    expect(
      await screen.findByRole('option', { name: /Create organization 'Acme Labs'/ }),
    ).toBeInTheDocument();
  });
});

describe('SuggestTextInput keeps the combobox contract', () => {
  it('points the input at the option Enter would commit', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({
      values: [
        // An exact match is dropped from the list, so this row is also the
        // signal that the debounced term has reached the whole word.
        { value: 'Acme', count: 9 },
        { value: 'Acme Corp', count: 3 },
        { value: 'Acme Labs', count: 1 },
      ],
    });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Company' });
    await user.type(input, 'Acme');
    await screen.findByRole('option', { name: /Acme Corp/ });

    // A new term intentionally leaves no option current. Arrowing is the
    // explicit commitment that makes aria-activedescendant truthful.
    // On a loaded machine the keystrokes can spread past the 140ms debounce, so
    // read the term off the list itself rather than off the clock: while the
    // lookup still trails the typing, the exact match is one of the rows.
    await waitFor(() => expect(screen.queryByRole('option', { name: /^Acme ×9/ })).toBeNull());

    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Acme Corp/ }).id,
    );
  });

  it('controls the listbox only while there is one on screen', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'Acme Corp', count: 3 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Company' });
    expect(input).not.toHaveAttribute('aria-controls');

    await user.type(input, 'Acme');
    await screen.findByRole('option', { name: /Acme Corp/ });

    expect(input).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox', { name: 'Company' }).id,
    );
  });
});
