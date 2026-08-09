/**
 * FieldRenderer: url register + checkbox toggle + error display.
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <Harness field={urlField} errors={{ props: { url: { type: 'required', message: 'URL is required' } } }} />,
    );
    expect(screen.getByText('URL is required')).toBeInTheDocument();
  });
});
