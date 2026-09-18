import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render.js';
import {
  ConnectionComposer,
  additionalConnectionSub,
  connectionOptionsFor,
} from './ConnectionComposer.js';
import type { ConnectionDraft } from './EdgeSubEditorRow.js';

it('keeps a pending member identifiable with labeled editable properties and removal', async () => {
  const user = userEvent.setup();
  const option = connectionOptionsFor('organization').find((item) => item.key === 'MEMBER_OF:in')!;
  const draft: ConnectionDraft = {
    key: 'member-draft',
    kind: 'additional',
    sub: additionalConnectionSub(option),
    target: {
      id: 'person-1',
      type: 'person',
      title: 'Fictional accessibility community member with a long name',
    },
    props: { role: 'Coordinator', since: '2026-01-02' },
  };
  const onChange = vi.fn();
  renderWithApp(
    <ConnectionComposer nodeType="organization" drafts={[draft]} onChange={onChange} />,
  );
  expect(screen.getByText(draft.target.title)).toBeVisible();
  expect(screen.getByText('Role', { selector: 'label' })).toBeVisible();
  expect(screen.getByText('Since', { selector: 'label' })).toBeVisible();
  expect(screen.getByLabelText('Role')).toHaveValue('Coordinator');
  expect(screen.getByLabelText('Since')).toHaveValue('2026-01-02');
  await user.clear(screen.getByLabelText('Role'));
  expect(onChange).toHaveBeenCalledWith([{ ...draft, props: { ...draft.props, role: undefined } }]);
  await user.click(screen.getByRole('button', { name: `Unlink ${draft.target.title}` }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});
