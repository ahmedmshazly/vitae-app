/**
 * The per-field diff a re-import proposes: both sides of every field shown, and
 * each one refusable on its own.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  fieldLabel,
  formatFieldValue,
  ImportProposalDiff,
  type RowProposal,
} from './ImportProposalDiff.js';

function proposal(over: Partial<RowProposal> = {}): RowProposal {
  const fields = over.fields ?? [
    { key: 'props.city', from: 'Berlin', to: 'Cairo' },
    { key: 'props.headline', from: undefined, to: 'Staff SWE' },
  ];
  return {
    identity_key: 'contact:email:sarah@nile-robotics.test',
    target_node_id: 'p1',
    target_title: 'Sarah Chen',
    target_rev: 4,
    fields,
    accepted: over.accepted ?? fields.map((f) => f.key),
    ...over,
  };
}

describe('fieldLabel', () => {
  it('drops the storage path a reviewer never asked about', () => {
    expect(fieldLabel('props.city')).toBe('city');
    expect(fieldLabel('title')).toBe('title');
    expect(fieldLabel('notes_md')).toBe('notes');
    expect(fieldLabel('props.start_date')).toBe('start date');
  });
});

describe('formatFieldValue', () => {
  it('names an absent value instead of drawing a blank gap', () => {
    expect(formatFieldValue(undefined)).toBe('not set');
    expect(formatFieldValue(null)).toBe('not set');
    expect(formatFieldValue('')).toBe('empty');
    expect(formatFieldValue([])).toBe('none');
  });

  it('renders values rather than counting them', () => {
    expect(formatFieldValue(['a@x.test', 'b@x.test'])).toBe('a@x.test, b@x.test');
    expect(formatFieldValue(7)).toBe('7');
    expect(formatFieldValue(false)).toBe('false');
    expect(formatFieldValue({ linkedin: 'https://x.test' })).toBe('{"linkedin":"https://x.test"}');
  });
});

describe('ImportProposalDiff', () => {
  it('shows both sides of every field and says nothing is written yet', () => {
    render(<ImportProposalDiff proposal={proposal()} />);
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Cairo')).toBeInTheDocument();
    expect(screen.getByText('not set')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is written until you accept this row/)).toBeInTheDocument();
  });

  it('names the key that matched, so the reviewer can see why these are one record', () => {
    render(<ImportProposalDiff proposal={proposal()} />);
    expect(screen.getByText('contact:email:sarah@nile-robotics.test')).toBeInTheDocument();
  });

  it('hands back the whole accepted set when one field is dropped', async () => {
    const onToggleField = vi.fn();
    render(<ImportProposalDiff proposal={proposal()} onToggleField={onToggleField} />);
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(onToggleField).toHaveBeenCalledWith(['props.headline']);
  });

  it('adds a field back without disturbing the others', async () => {
    const onToggleField = vi.fn();
    render(
      <ImportProposalDiff
        proposal={proposal({ accepted: ['props.headline'] })}
        onToggleField={onToggleField}
      />,
    );
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(onToggleField).toHaveBeenCalledWith(['props.city', 'props.headline']);
  });

  it('shows the diff read only once the batch can no longer be changed', () => {
    render(<ImportProposalDiff proposal={proposal()} />);
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });
});
