/**
 * FieldRenderer: url register + checkbox toggle + error display.
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@vitae/core';
import { resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { FieldRenderer, type AnyControl, type AnyRegister } from './FieldRenderer.js';

beforeEach(() => {
  resetMockApi();
});

const urlField: FieldDescriptor = {
  key: 'url',
  label: 'URL',
  widget: 'url',
  mono: true,
};

const checkField: FieldDescriptor = {
  key: 'active',
  label: 'Active',
  widget: 'checkbox',
};

interface FormValues {
  props: { url: string; active: boolean };
}

function Harness({
  field,
  errors = {},
}: {
  field: FieldDescriptor;
  errors?: FieldErrors<FormValues>;
}) {
  const { control, register } = useForm<FormValues>({
    defaultValues: { props: { url: '', active: false } },
  });
  return (
    <FieldRenderer
      field={field}
      ownerType="link"
      control={control as unknown as AnyControl}
      register={register as unknown as AnyRegister}
      errors={errors ?? {}}
    />
  );
}

describe('FieldRenderer', () => {
  it('registers a url field for typing', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness field={urlField} />);
    const input = screen.getByLabelText('URL');
    await user.type(input, 'https://example.com');
    expect(input).toHaveValue('https://example.com');
  });

  it('toggles a checkbox field', async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness field={checkField} />);
    const box = screen.getByRole('checkbox', { name: 'Active' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
  });

  it('surfaces a required field error from errors', () => {
    renderWithApp(
      <Harness
        field={urlField}
        errors={{ props: { url: { type: 'required', message: 'URL is required' } } }}
      />,
    );
    expect(screen.getByText('URL is required')).toBeInTheDocument();
  });

  it('keeps money structured while naming the composite control', async () => {
    const user = userEvent.setup();
    const field: FieldDescriptor = {
      key: 'budget',
      label: 'Budget',
      widget: 'money',
      withPeriod: true,
    };
    renderWithApp(<StructuredHarness field={field} />);

    expect(screen.getByRole('group', { name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Budget amount' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Budget currency' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Budget period' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('0'), '1200');
    await user.type(screen.getByPlaceholderText('USD'), 'usd');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('submitted')).toHaveTextContent(
      JSON.stringify({ props: { budget: { amount: 1200, currency: 'USD' } } }),
    );
  });

  it('keeps string lists as arrays and gives their control group a name', async () => {
    const user = userEvent.setup();
    const field: FieldDescriptor = {
      key: 'phones',
      label: 'Phones',
      widget: 'string-list',
      placeholder: '+1 555 0100',
    };
    renderWithApp(<StructuredHarness field={field} />);

    expect(screen.getByRole('group', { name: 'Phones' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add phone/i }));
    expect(screen.getByRole('textbox', { name: 'Phone 1' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('+1 555 0100'), '+1 212 555 0100');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('submitted')).toHaveTextContent(
      JSON.stringify({ props: { phones: ['+1 212 555 0100'] } }),
    );
  });

  it('names object-list row removal by row rather than as an ambiguous item', async () => {
    const user = userEvent.setup();
    const field: FieldDescriptor = {
      key: 'highlights',
      label: 'Highlights',
      widget: 'object-list',
      itemFields: [{ key: 'label', label: 'Label', widget: 'textarea' }],
    };
    renderWithApp(<StructuredHarness field={field} />);

    await user.click(screen.getByRole('button', { name: /add highlight/i }));
    expect(screen.getByRole('group', { name: 'Highlights' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove highlight 1' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Label'), 'Launched migration');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('submitted')).toHaveTextContent(
      JSON.stringify({ props: { highlights: [{ label: 'Launched migration' }] } }),
    );
  });
});

function StructuredHarness({ field }: { field: FieldDescriptor }) {
  const { control, register, handleSubmit } = useForm<Record<string, unknown>>({
    defaultValues: { props: {} },
  });
  const [submitted, setSubmitted] = useState<string>();
  return (
    <form onSubmit={handleSubmit((values) => setSubmitted(JSON.stringify(values)))}>
      <FieldRenderer
        field={field}
        ownerType="publication"
        control={control as unknown as AnyControl}
        register={register as unknown as AnyRegister}
        errors={{}}
      />
      <button type="submit">Save</button>
      {submitted && <output data-testid="submitted">{submitted}</output>}
    </form>
  );
}
