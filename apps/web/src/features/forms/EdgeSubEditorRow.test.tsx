/**
 * Edge sub-editor row: label, linked target, unlink notifies parent.
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EdgeSubEditor } from '@vitae/core';
import { resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { EdgeSubEditorRow, type ConnectionDraft } from './EdgeSubEditorRow.js';

beforeEach(() => {
  resetMockApi();
});

const sub: EdgeSubEditor = {
  edgeType: 'ROLE_AT',
  direction: 'out',
  label: 'Organization',
  targetTypes: ['organization'],
  cardinality: 'one',
  inlineProps: [],
};

describe('EdgeSubEditorRow', () => {
  it('renders a linked target and unlinks via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const drafts: ConnectionDraft[] = [
      {
        key: 'd1',
        sub,
        target: { id: 'o1', type: 'organization', title: 'Nile Robotics' },
        props: {},
      },
    ];

    renderWithApp(<EdgeSubEditorRow sub={sub} drafts={drafts} onChange={onChange} />);

    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Nile Robotics')).toBeInTheDocument();
    // Cardinality one + existing draft → no add picker.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unlink Nile Robotics' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
