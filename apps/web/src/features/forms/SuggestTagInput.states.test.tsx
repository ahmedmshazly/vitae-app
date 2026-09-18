/**
 * The states this field used to swallow, and the listbox contract it did not
 * keep. Every case here is something a person did, or waited on, and got no
 * word about.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SuggestKind } from '@vitae/core';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { SuggestTagInput } from './SuggestTagInput.js';

beforeEach(() => {
  resetMockApi();
});

function Harness({ kind = 'topic' as SuggestKind, initial = [] as string[] }) {
  const [value, setValue] = useState(initial);
  return <SuggestTagInput value={value} onChange={setValue} kind={kind} aria-label="Topics" />;
}

describe('SuggestTagInput reports what it could not do', () => {
  it('says the lookup failed rather than looking like a graph with no matches', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValue(new Error('suggest is down'));
    renderWithApp(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Topics' }), 'rob');

    expect(await screen.findByText('Search failed.')).toBeInTheDocument();
    expect(screen.getByText('suggest is down')).toBeInTheDocument();
  });

  it('says nothing was created when the stub create is rejected', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    mockApi.post.mockRejectedValue(new Error('skill already exists'));
    renderWithApp(<Harness kind="skill" />);

    await user.type(screen.getByRole('combobox', { name: 'Topics' }), 'Rust');
    await user.click(await screen.findByRole('option', { name: /Create skill/ }));

    expect(await screen.findByText('Nothing was created')).toBeInTheDocument();
    expect(screen.getByText('skill already exists')).toBeInTheDocument();
  });

  it('names the record it minted, which a new tag on its own does not', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    mockApi.post.mockResolvedValue({ node: { id: 'n1' } });
    renderWithApp(<Harness kind="skill" />);

    await user.type(screen.getByRole('combobox', { name: 'Topics' }), 'Rust');
    await user.click(await screen.findByRole('option', { name: /Create skill/ }));

    expect(await screen.findByText('Created')).toBeInTheDocument();
    expect(screen.getByText(/skill 'Rust'/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rust' })).toBeInTheDocument();
  });

  it('keeps a typed value that a field offering stub-create used to drop on blur', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [] });
    renderWithApp(<Harness kind="skill" />);

    await user.type(screen.getByRole('combobox', { name: 'Topics' }), 'Rust');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Rust' })).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});

describe('SuggestTagInput keeps the combobox contract', () => {
  it('points the input at the option Enter would commit', async () => {
    const user = userEvent.setup();
    // Answer the term that was actually asked for. The lookup is debounced and
    // a new term sends the highlight home, so on a loaded machine a list drawn
    // from a half-typed term can still be on screen when the arrow key lands,
    // and the answer for the whole word then re-homes the row. Keying the mock
    // to the term makes the list itself say which lookup drew it.
    mockApi.get.mockImplementation((url: string) => {
      const q = new URLSearchParams(url.split('?')[1] ?? '').get('q') ?? '';
      return Promise.resolve({
        values:
          q === 'rob'
            ? [
                { value: 'robotics', count: 2 },
                { value: 'robustness', count: 1 },
              ]
            : [],
      });
    });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Topics' });
    await user.type(input, 'rob');
    await screen.findByRole('option', { name: /robotics/ });

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /robotics/ }).id,
    );
    expect(screen.getByRole('option', { name: /robotics/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('controls the listbox only while there is one on screen', async () => {
    const user = userEvent.setup();
    mockApi.get.mockResolvedValue({ values: [{ value: 'robotics', count: 2 }] });
    renderWithApp(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Topics' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');

    await user.type(input, 'rob');
    await screen.findByRole('option', { name: /robotics/ });

    const listbox = screen.getByRole('listbox', { name: 'Topics' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
  });
});
