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
import { fireEvent, render, screen } from '@testing-library/react';
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
      expect(
        onSubmit.mock.calls[0]![0].values.props,
        `${type}: props must not be undefined`,
      ).toBeDefined();
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

  it("renders the descriptor's own subject prompt", () => {
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
    const { container } = renderForm(
      <EntityForm type="person" submitLabel="Create person" onSubmit={onSubmit} />,
    );

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

/**
 * A representative, valid create value for every shipped node type.  The
 * title-only gate above catches a silent form, but it deliberately does not
 * prove that each type's required descriptor fields make it all the way to
 * the create payload.  Keep this table explicit rather than deriving values
 * from Zod: a new required field must force a reviewer to choose a truthful
 * UI value and to add it to this contract.
 *
 * Subject assignment is covered by the subject-bearing suite below.  It is a
 * connection draft rather than a node payload field, so this matrix removes
 * it only to isolate node value serialization.
 */
const createFixtures: Record<NodeType, Record<string, unknown>> = {
  person: {},
  organization: {},
  role: { employment_type: 'full_time' },
  project: {},
  repository: { full_name: 'vitae/example' },
  skill: {},
  education: {},
  certification: {},
  course: {},
  publication: {},
  talk: {},
  award: {},
  reference: {},
  job_posting: {},
  application: { role_title: 'Staff engineer', status: 'draft' },
  interview: {},
  area: {},
  opportunity: {},
  event: { kind: 'conference' },
  interaction: { kind: 'meeting', occurred_at: '2026-02-03T10:00:00Z' },
  task: { status: 'next' },
  goal: {},
  habit: {},
  journal_entry: { entry_date: '2026-02-03' },
  idea: { status: 'spark' },
  link: { url: 'https://example.test/reading' },
  document: { doc_kind: 'paper' },
  subscription: {},
  post: {},
  location: {},
  trip: {},
  media_item: {},
  highlight: {},
  asset: {},
  health_log: {},
  account: {},
};

describe('EntityForm, create serialization matrix', () => {
  it.each(types)('%s: preserves the title and descriptor-required create values', async (type) => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const descriptor = NODE_FORM_DESCRIPTORS[type];
    const props = createFixtures[type];

    renderForm(
      <EntityForm
        type={type}
        // Subject ownership is asserted independently. This isolates the
        // serialised node envelope from the connection draft it creates.
        descriptor={{ ...descriptor, subject: undefined }}
        defaultValues={{ title: `${descriptor.titleLabel} probe`, props }}
        submitLabel={`Create ${type}`}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('textbox', { name: descriptor.titleLabel })).toHaveValue(
      `${descriptor.titleLabel} probe`,
    );
    await user.click(screen.getByRole('button', { name: `Create ${type}` }));

    expect(onSubmit, `${type} should submit a valid descriptor fixture`).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          title: `${descriptor.titleLabel} probe`,
          props: expect.objectContaining(props),
        }),
      }),
    );
  });

  it('lists each descriptor-required field in its create fixture', () => {
    for (const type of types) {
      const required = NODE_FORM_DESCRIPTORS[type].fields.filter((field) => field.required);
      for (const field of required) {
        expect(
          createFixtures[type],
          `${type}.${field.key} needs a truthful create value`,
        ).toHaveProperty(field.key);
      }
    }
  });
});

describe('EntityForm, validation waits for the user', () => {
  it('opens clean: no error before the form has been submitted', () => {
    const { container } = renderForm(
      <EntityForm type="person" submitLabel="Create" onSubmit={vi.fn()} />,
    );
    // The dialog's mount sequence blurs the title field before the user gets
    // to it, which used to mark it touched and open the form already showing
    // "Required" on a field nobody had typed in.
    expect(visibleErrorCount(container)).toBe(0);
    expect(container.querySelector('.vt-fld--error')).toBeNull();
  });

  it('complains once you try to submit, and clears as you fix it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = renderForm(
      <EntityForm type="person" submitLabel="Create" onSubmit={onSubmit} />,
    );

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
    renderForm(
      <EntityForm type="person" submitLabel="Create" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hands them to the caller when given a formId, and tags the form with it', () => {
    const { container } = renderForm(
      <EntityForm
        type="person"
        submitLabel="Create"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        formId="nfd-1"
      />,
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

describe('EntityForm, date-bearing records', () => {
  it('records month-only open spans without inventing an end date', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container } = renderForm(
      <EntityForm type="trip" submitLabel="Create trip" onSubmit={onSubmit} />,
    );

    await user.type(container.querySelector('#ef-title') as HTMLElement, 'Summer residency');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date precision' }), 'month');
    const start = container.querySelector('#ef-start') as HTMLInputElement;
    expect(start).toHaveAttribute('type', 'month');
    fireEvent.change(start, { target: { value: '2026-07' } });
    await user.click(screen.getByRole('button', { name: 'Create trip' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          title: 'Summer residency',
          start_date: '2026-07-01',
          date_precision: 'month',
        }),
      }),
    );
    expect(onSubmit.mock.calls[0]![0].values.end_date).toBeUndefined();
  });

  it('rejects a closed span that ends before it begins without rejecting an open one', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container } = renderForm(
      <EntityForm type="education" submitLabel="Create education" onSubmit={onSubmit} />,
    );

    await user.type(container.querySelector('#ef-title') as HTMLElement, 'Computer science');
    fireEvent.change(container.querySelector('#ef-start') as HTMLInputElement, {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(container.querySelector('#ef-end') as HTMLInputElement, {
      target: { value: '2026-05-31' },
    });
    await user.click(screen.getByRole('button', { name: 'Create education' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('End must be on or after start.');
  });
});
