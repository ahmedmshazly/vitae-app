/**
 * Writing one entry. The form takes its shape from the published grammar, so
 * these prove the grammar reaches the controls: an atom picker only where atoms
 * are admitted, the record picker withdrawn once a section's citation cap is
 * reached, and a shortfall stated rather than enforced, because refusing the
 * entry would throw away the sentence the operator had just written.
 */
import './../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DossierSectionGrammar } from '@vitae/core';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { DossierClaimForm } from './DossierClaimForm.js';

// Stood in for, rather than driven, so these stay about the form. The picker
// proves its own debounce, keyboard handling and search states next door.
vi.mock('../components/EntityPicker.js', () => ({
  EntityPicker: ({ onPick }: { onPick: (entity: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onPick({ id: 'n1', type: 'project', title: 'Atlas rewrite' })}
    >
      Pick a record
    </button>
  ),
}));

function grammar(over: Partial<DossierSectionGrammar> = {}): DossierSectionGrammar {
  return {
    id: 'impact',
    heading: 'Impact',
    purpose: 'What changed because of the work.',
    admits: ['project'],
    admitsAtoms: false,
    minClaims: 2,
    maxClaims: 12,
    minCitationsPerClaim: 1,
    maxCitationsPerClaim: null,
    required: true,
    ...over,
  };
}

const ATOMS = {
  atoms: [
    { id: 'a1', owner_title: 'Atlas', variants: [{ text: 'Cut p95 latency by 40%', is_default: true }] },
  ],
};

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue(ATOMS);
});

describe('dossier claim form', () => {
  it('sends the sentence and its evidence, then clears once it is stored', async () => {
    const onAdd = vi.fn().mockResolvedValue(true);
    renderWithApp(
      <DossierClaimForm section={grammar()} sectionFull={false} busy={false} onAdd={onAdd} />,
    );

    const text = screen.getByLabelText('The sentence this entry asserts');
    await userEvent.type(text, 'I owned the Atlas rewrite.');
    await userEvent.click(screen.getByRole('button', { name: 'Pick a record' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add this entry to Impact' }));

    expect(onAdd).toHaveBeenCalledWith({
      text: 'I owned the Atlas rewrite.',
      cites: [{ kind: 'node', id: 'n1', label: 'Atlas rewrite' }],
    });
    expect(text).toHaveValue('');
  });

  it('keeps the draft when the entry was not stored', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderWithApp(
      <DossierClaimForm section={grammar()} sectionFull={false} busy={false} onAdd={onAdd} />,
    );

    const text = screen.getByLabelText('The sentence this entry asserts');
    await userEvent.type(text, 'I owned the Atlas rewrite.');
    await userEvent.click(screen.getByRole('button', { name: 'Add this entry to Impact' }));

    expect(text).toHaveValue('I owned the Atlas rewrite.');
  });

  it('offers an atom only where the grammar admits one', async () => {
    const { unmount } = renderWithApp(
      <DossierClaimForm section={grammar()} sectionFull={false} busy={false} onAdd={vi.fn()} />,
    );
    expect(screen.queryByText('Or cite a résumé atom')).not.toBeInTheDocument();
    unmount();

    renderWithApp(
      <DossierClaimForm
        section={grammar({ admitsAtoms: true })}
        sectionFull={false}
        busy={false}
        onAdd={vi.fn()}
      />,
    );
    expect(await screen.findByText('Or cite a résumé atom')).toBeInTheDocument();
  });

  it('reports an atom list that failed rather than showing an empty picker', async () => {
    mockApi.get.mockRejectedValue(new Error('atoms unavailable'));
    renderWithApp(
      <DossierClaimForm
        section={grammar({ admitsAtoms: true })}
        sectionFull={false}
        busy={false}
        onAdd={vi.fn()}
      />,
    );

    expect(await screen.findByText('Atoms could not be listed')).toBeInTheDocument();
    expect(screen.getByText(/only the atom picker is empty/)).toBeInTheDocument();
  });

  it('withdraws the picker once the section will take no more evidence', async () => {
    renderWithApp(
      <DossierClaimForm
        section={grammar({ maxCitationsPerClaim: 1 })}
        sectionFull={false}
        busy={false}
        onAdd={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pick a record' }));

    expect(screen.queryByRole('button', { name: 'Pick a record' })).not.toBeInTheDocument();
    expect(screen.getByText(/takes 1 record per entry/)).toBeInTheDocument();
    const evidence = screen.getByRole('list', { name: 'Evidence on the new Impact entry' });
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(1);
  });

  it('states a shortfall in evidence instead of refusing the entry', async () => {
    const onAdd = vi.fn().mockResolvedValue(true);
    renderWithApp(
      <DossierClaimForm section={grammar()} sectionFull={false} busy={false} onAdd={onAdd} />,
    );

    await userEvent.type(
      screen.getByLabelText('The sentence this entry asserts'),
      'Nothing points at this yet.',
    );
    expect(screen.getByText(/records the gap as outstanding work/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add this entry to Impact' }));
    expect(onAdd).toHaveBeenCalledWith({ text: 'Nothing points at this yet.', cites: [] });
  });

  it('says why a full section has no form rather than showing a dead one', () => {
    renderWithApp(
      <DossierClaimForm section={grammar()} sectionFull busy={false} onAdd={vi.fn()} />,
    );

    expect(screen.getByText(/holds every entry its grammar allows/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this entry to Impact' })).not.toBeInTheDocument();
  });
});
