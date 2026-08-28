/**
 * Renders one FieldDescriptor with the matching @vitae/ui primitive, wired
 * into react-hook-form. Structured widgets (tags, rating, money, lists,
 * selects) go through <Controller>; plain text/date/number use `register`.
 */
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import {
  Checkbox,
  Field,
  Input,
  MoneyField,
  Rating,
  Select,
  StringListField,
  TagInput,
  Textarea,
} from '@vitae/ui';
import { suggestSourceFor, type FieldDescriptor } from '@vitae/core';
import { SuggestTagInput } from './SuggestTagInput.js';
import { SuggestTextInput } from './SuggestTextInput.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyControl = Control<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRegister = UseFormRegister<any>;

export interface FieldRendererProps {
  field: FieldDescriptor;
  /**
   * Node type being edited. Suggestions for a plain text field come from that
   * same field on other records of this type, so the renderer has to know which
   * type it is rendering.
   */
  ownerType: string;
  /** Path prefix, e.g. "props". */
  prefix?: string;
  control: AnyControl;
  register: AnyRegister;
  errors: FieldErrors;
}

function errorAt(errors: FieldErrors, path: string): string | undefined {
  let cur: unknown = errors;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  const msg = (cur as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' ? msg : undefined;
}

/** ISO datetime (with offset) → value for <input type="datetime-local">. */
function isoToLocal(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function FieldRenderer({ field, ownerType, prefix = 'props', control, register, errors }: FieldRendererProps) {
  const name = prefix ? `${prefix}.${field.key}` : field.key;
  const error = errorAt(errors, name);
  const common = { label: field.label, required: field.required, help: field.help, error, htmlFor: name };

  switch (field.widget) {
    // Every text field suggests what has been typed before, so the same value
    // stops being re-entered under three spellings. Free text always wins, the
    // list is an aid, never a gate. URLs are excluded: they are unique per
    // record, so a dropdown of past values is noise.
    case 'text':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <SuggestTextInput
                id={name}
                value={typeof f.value === 'string' ? f.value : ''}
                onChange={f.onChange}
                source={suggestSourceFor(ownerType, field)}
                propKey={field.key}
                mono={field.mono}
                placeholder={field.placeholder}
              />
            )}
          />
        </Field>
      );

    case 'url':
      return (
        <Field {...common}>
          <Input
            id={name}
            mono={field.mono}
            invalid={Boolean(error)}
            placeholder={field.placeholder}
            type="url"
            {...register(name)}
          />
        </Field>
      );

    case 'textarea':
      return (
        <Field {...common}>
          <Textarea id={name} invalid={Boolean(error)} placeholder={field.placeholder} {...register(name)} />
        </Field>
      );

    case 'number':
      return (
        <Field {...common}>
          <Input
            id={name}
            mono
            invalid={Boolean(error)}
            type="number"
            step="any"
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            {...register(name, {
              setValueAs: (v: unknown) => (v === '' || v == null ? undefined : Number(v)),
            })}
          />
        </Field>
      );

    case 'date':
      return (
        <Field {...common}>
          <Input
            id={name}
            mono
            invalid={Boolean(error)}
            type="date"
            {...register(name, { setValueAs: (v: unknown) => (v === '' ? undefined : v) })}
          />
        </Field>
      );

    case 'datetime':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <Input
                id={name}
                mono
                invalid={Boolean(error)}
                type="datetime-local"
                value={isoToLocal(f.value)}
                onChange={(e) => f.onChange(localToIso(e.target.value))}
                onBlur={f.onBlur}
              />
            )}
          />
        </Field>
      );

    case 'select':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <Select
                id={name}
                value={typeof f.value === 'string' ? f.value : undefined}
                onChange={f.onChange}
                options={field.options ?? []}
                placeholder={field.placeholder ?? 'Select...'}
                invalid={Boolean(error)}
                clearable={!field.required}
              />
            )}
          />
        </Field>
      );

    case 'checkbox':
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => (
            <div className="form-checkline">
              <Checkbox id={name} checked={f.value === true} onChange={f.onChange} label={field.label} />
              {field.help && <span className="vt-fld__help">{field.help}</span>}
            </div>
          )}
        />
      );

    case 'rating':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <Rating
                id={name}
                value={typeof f.value === 'number' ? f.value : undefined}
                onChange={f.onChange}
                max={field.max ?? 5}
                label={field.label}
              />
            )}
          />
        </Field>
      );

    case 'tags':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <TagInput
                id={name}
                value={Array.isArray(f.value) ? (f.value as string[]).map(String) : []}
                onChange={f.onChange}
                mono={field.mono}
                placeholder={field.placeholder}
              />
            )}
          />
        </Field>
      );

    case 'suggest-list':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <SuggestTagInput
                id={name}
                value={Array.isArray(f.value) ? (f.value as string[]).map(String) : []}
                onChange={f.onChange}
                kind={field.suggestKind ?? 'tag'}
                mono={field.mono}
                placeholder={field.placeholder}
              />
            )}
          />
        </Field>
      );

    case 'email-list':
    case 'string-list':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <StringListField
                value={Array.isArray(f.value) ? (f.value as string[]) : []}
                onChange={f.onChange}
                mono={field.mono}
                placeholder={field.widget === 'email-list' ? 'name@example.com' : field.placeholder}
                // Imperative, and singular: you add one row at a time. The
              // label was the plural field name, so the control read "+ emails".
              addLabel={`Add ${field.label.replace(/s$/i, '').toLowerCase()}`}
              />
            )}
          />
        </Field>
      );

    case 'money':
      return (
        <Field {...common}>
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <MoneyField
                id={name}
                value={(f.value as Record<string, unknown> | undefined) ?? undefined}
                onChange={f.onChange}
                amountKey={field.amountKey}
                withPeriod={field.withPeriod}
              />
            )}
          />
        </Field>
      );

    case 'object-list':
      return (
        <Field {...common}>
          <ObjectListField field={field} ownerType={ownerType} name={name} control={control} register={register} errors={errors} />
        </Field>
      );

    default:
      return null;
  }
}

function ObjectListField({
  field,
  ownerType,
  name,
  control,
  register,
  errors,
}: {
  field: FieldDescriptor;
  ownerType: string;
  name: string;
  control: AnyControl;
  register: AnyRegister;
  errors: FieldErrors;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const itemFields = field.itemFields ?? [];
  return (
    <div className="objlist">
      {fields.map((row, i) => (
        <div key={row.id} className="objlist__row">
          <div className="objlist__fields">
            {itemFields.map((f) => (
              <FieldRenderer
                key={f.key}
                field={f}
                ownerType={ownerType}
                prefix={`${name}.${i}`}
                control={control}
                register={register}
                errors={errors}
              />
            ))}
          </div>
          <button type="button" className="vt-strlist__x" aria-label="Remove item" onClick={() => remove(i)}>
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="vt-strlist__add"
        onClick={() =>
          append(Object.fromEntries(itemFields.map((f) => [f.key, f.widget === 'checkbox' ? false : ''])))
        }
      >
        + Add {field.label.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  );
}
