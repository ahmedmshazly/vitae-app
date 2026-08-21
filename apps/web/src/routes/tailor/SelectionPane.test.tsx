import '../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { SelectionPane } from './SelectionPane.js';
import { defaultDraft } from './types.js';
import type { AtomScore, AtomView, Draft, TailorResult } from './types.js';

function atom(over: Partial<AtomView> = {}): AtomView {
  return {
    id: 'atom-1',
    owner_node: 'role-1',
    owner_title: 'Staff Engineer at Northstar',
    owner_type: 'role',
    kind: 'bullet',
    pinned: false,
    blocked: false,
    skill_ids: [],
    variants: [
      { id: 'v1', emphasis: 'technical', text: 'Cut p99 latency by 40%.', is_default: true },
      { id: 'v2', emphasis: 'leadership', text: 'Led the latency programme.', is_default: false },
    ],
    ...over,
  };
}

function result(over: Partial<TailorResult> = {}): TailorResult {
  return {
    scores: [],
    selection: {
      entries: [
        {
          atomId: 'atom-1',
          ownerId: 'role-1',
          emphasis: 'technical',
          text: 'Cut p99 latency by 40%.',
          lines: 2,
        },
      ],
      totalLines: 2,
      weightedCoverage: 0.62,
    },
    pageEstimate: { lines: 2, budget: 44, pages: 1, fill: 0.05 },
    ...over,
  };
}

function renderPane(over: Partial<Parameters<typeof SelectionPane>[0]> = {}) {
  const onDraft = vi.fn();
  const onRunAuto = vi.fn();
  const props = {
    atoms: [atom()],
    draft: defaultDraft() as Draft,
    onDraft,
    tailorResult: null as TailorResult | null,
    scoreById: new Map<string, AtomScore>(),
    tailorPending: false,
    onRunAuto,
    ...over,
  };
  return { onDraft, onRunAuto, ...renderWithApp(<SelectionPane {...props} />) };
}

describe('SelectionPane', () => {
  beforeEach(() => {
    resetMockApi();
  });

  it('explains where atoms come from when the library is empty', () => {
    renderPane({ atoms: [] });
    expect(screen.getByText('No evidence to select from')).toBeInTheDocument();
    expect(screen.getByText(/Add a few in the Evidence library/)).toBeInTheDocument();
  });

  it('says what auto mode will do before it has run', async () => {
    const user = userEvent.setup();
    const { onRunAuto } = renderPane();
    expect(screen.getByText(/scores every atom against the job description/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Auto-select atoms' }));
    expect(onRunAuto).toHaveBeenCalled();
  });

  it('traces progress while the selection is being packed', () => {
    renderPane({ tailorPending: true });
    expect(screen.getByText('Scoring and packing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecting…' })).toBeDisabled();
  });

  it('labels the pin and exclude actions in words, not glyphs', async () => {
    const user = userEvent.setup();
    const { onDraft } = renderPane({ tailorResult: result() });
    const pin = screen.getByRole('button', { name: 'Pin' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    expect(onDraft).toHaveBeenCalledWith({ atomOrder: undefined, pins: ['atom-1'] });
  });

  it('drops a pin when the same atom is excluded', async () => {
    const user = userEvent.setup();
    const draft = { ...defaultDraft(), pins: ['atom-1'] } as Draft;
    const { onDraft } = renderPane({ draft, tailorResult: result() });
    expect(screen.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Exclude' }));
    expect(onDraft).toHaveBeenCalledWith({ blocks: ['atom-1'], pins: [] });
  });

  it('names the wording variant control after the role it belongs to', () => {
    renderPane({ tailorResult: result() });
    expect(
      screen.getByRole('combobox', { name: 'Wording variant for Staff Engineer at Northstar' }),
    ).toBeInTheDocument();
  });

  it('offers no variant control for an atom with one wording', () => {
    const single = atom({ variants: [atom().variants[0]!] });
    renderPane({ atoms: [single], tailorResult: result() });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('includes an atom from the manual checklist', async () => {
    const user = userEvent.setup();
    const draft = { ...defaultDraft(), mode: 'manual' } as Draft;
    const { onDraft } = renderPane({ draft });
    await user.click(screen.getByRole('checkbox', { name: /Cut p99 latency/ }));
    expect(onDraft).toHaveBeenCalledWith({ include: ['atom-1'] });
  });

  it('groups the manual checklist under the role each atom belongs to', () => {
    const draft = { ...defaultDraft(), mode: 'manual' } as Draft;
    renderPane({ draft });
    expect(
      screen.getByRole('heading', { name: 'Staff Engineer at Northstar' }),
    ).toBeInTheDocument();
  });
});
