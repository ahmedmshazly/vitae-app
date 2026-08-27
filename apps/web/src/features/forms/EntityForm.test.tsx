/**
 * The contract this suite defends: submitting an entity form must always do
 * SOMETHING the user can perceive, either it calls onSubmit, or it renders a
 * visible validation error. Never nothing.
 *
 * This is not hypothetical. `sanitize()` prunes empty objects, which dropped
 * `props` entirely whenever every type-specific field was left blank; no type's
 * props schema accepts `undefined`, so react-hook-form failed validation on a
 * path the form renders no error for. The result was a dead Create button, no
 * error, no request, no feedback, for 23 of the 33 node types. E2E covered the
 * happy path and missed it, because the happy path fills fields in.
 */
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { NODE_FORM_DESCRIPTORS, NODE_TYPES, type NodeType } from '@vitae/core';
import { EntityForm } from './EntityForm.js';

const types = NODE_TYPES as readonly NodeType[];

/**
 * The subject picker asks the API who "me" is. There is no server here, so the
 * query fails fast and the picker simply offers no "That's me" shortcut, which
 * is the correct degraded behaviour and keeps this suite about form submission.
 */
function renderForm(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** The form renders field errors as text; treat any of them as "user informed". */
function visibleErrorCount(container: HTMLElement): number {
  return container.querySelectorAll('.field__error, [role="alert"]').length;
}

describe('EntityForm, title-only submit is never a silent no-op', () => {
  it.each(types)('%s: either submits or shows an error', async (type) => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container, unmount } = renderForm(
      <EntityForm type={type} submitLabel="Create" onSubmit={onSubmit} />,
    );

    const title = container.querySelector('#ef-title');
    expect(title, `${type} must render the title field`).not.toBeNull();
    await user.type(title as HTMLElement, 'Probe title');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const submitted = onSubmit.mock.calls.length > 0;
    const informed = visibleErrorCount(container) > 0;
    expect(
      submitted || informed,
      `${type}: the form neither called onSubmit nor rendered a visible error: ` +
        'the submit button is silently dead for this type',
    ).toBe(true);

    // When it does submit, `props` must survive sanitization: the API's schema
    // for every type requires an object, so dropping the key 422s server-side.
    if (submitted) {
      expect(onSubmit.mock.calls[0]![0].values.props, `${type}: props must not be undefined`).toBeDefined();
    }
    unmount();
  });

  it('covers every declared node type, so a new type cannot slip past this gate', () => {
    expect(types.length).toBe(Object.keys(NODE_FORM_DESCRIPTORS).length);
  });
});

describe('EntityForm, subject-bearing types demand an owner', () => {
  it('a publication cannot be created without saying whose it is', async () => {
    // `publication` has no required props, so the missing subject is the only
    // thing standing between this form and a successful submit.
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container } = renderForm(
      <EntityForm type="publication" submitLabel="Create" onSubmit={onSubmit} />,
    );

    await user.type(container.querySelector('#ef-title') as HTMLElement, 'On cache eviction');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit, 'an ownerless publication must not be creatable').not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/pick who this belongs to/i);
  });

  it('renders the descriptor’s own subject prompt', () => {
    renderForm(<EntityForm type="publication" onSubmit={vi.fn()} />);
    expect(screen.getByText('Who authored this?')).toBeTruthy();
  });

  it('types that belong to nobody show no subject picker', () => {
    renderForm(<EntityForm type="organization" onSubmit={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search people/i)).toBeNull();
  });
});

describe('EntityForm, a type with no required props submits on title alone', () => {
  it('person submits with every type-specific field left blank', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container } = renderForm(<EntityForm type="person" submitLabel="Create person" onSubmit={onSubmit} />);

    await user.type(container.querySelector('#ef-title') as HTMLElement, 'Blank Props Person');
    await user.click(screen.getByRole('button', { name: 'Create person' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const { values } = onSubmit.mock.calls[0]![0];
    expect(values.title).toBe('Blank Props Person');
    // `props` must be present and an object. It is not necessarily empty, the
    // person descriptor seeds its list fields, so untouched arrays arrive as [].
    // The regression being guarded is `props` going *missing*, not its contents.
    expect(values.props).toBeTypeOf('object');
    expect(values.props).not.toBeNull();
    for (const value of Object.values(values.props)) {
      expect(Array.isArray(value) ? value : [], 'seeded list fields stay empty').toEqual([]);
    }
  });
});

describe('EntityForm, validation waits for the user', () => {
  it('opens clean: no error before the form has been submitted', () => {
    const { container } = renderForm(<EntityForm type="person" submitLabel="Create" onSubmit={vi.fn()} />);
    // The dialog's mount sequence blurs the title field before the user gets
    // to it, which used to mark it touched and open the form already showing
    // "Required" on a field nobody had typed in.
    expect(visibleErrorCount(container)).toBe(0);
    expect(container.querySelector('.vt-fld--error')).toBeNull();
  });

  it('complains once you try to submit, and clears as you fix it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = renderForm(<EntityForm type="person" submitLabel="Create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');

    // reValidateMode: 'onChange', after the first complaint it corrects live.
    await user.type(container.querySelector('#ef-title') as HTMLElement, 'Lina');
    expect(visibleErrorCount(container)).toBe(0);
  });
});

describe('EntityForm, who owns the buttons', () => {
  it('renders its own actions when standing alone', () => {
    renderForm(<EntityForm type="person" submitLabel="Create" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hands them to the caller when given a formId, and tags the form with it', () => {
    const { container } = renderForm(
      <EntityForm type="person" submitLabel="Create" onSubmit={vi.fn()} onCancel={vi.fn()} formId="nfd-1" />,
    );
    // A dialog puts them in its sticky footer instead, outside the <form>,
    // reached by `form="nfd-1"`.
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(container.querySelector('form')).toHaveAttribute('id', 'nfd-1');
  });
});

describe('EntityForm, application status options follow the descriptor', () => {
  it('an interview edit does not offer walking back to draft', async () => {
    const user = userEvent.setup();
    const { nodeFormDescriptor } = await import('@vitae/core');
    renderForm(
      <EntityForm
        type="application"
        descriptor={nodeFormDescriptor('application', { applicationStatus: 'interview' })}
        defaultValues={{
          title: 'Staff engineer',
          props: { role_title: 'Staff engineer', status: 'interview' },
        }}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    expect(screen.getByRole('option', { name: 'Interview' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Applied' })).not.toBeInTheDocument();
  });
});
