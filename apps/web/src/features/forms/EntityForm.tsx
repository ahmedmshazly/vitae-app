/**
 * The schema-driven entity form engine (FR-CAP-002). One component renders all
 * 33 node types from NODE_FORM_DESCRIPTORS: envelope fields, per-type props in
 * sections, and inline edge sub-editors. Validation = the same Zod schemas the
 * API enforces, so errors surface inline before a request is ever made.
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input, Textarea } from '@vitae/ui';
import {
  isoDate,
  NODE_FORM_DESCRIPTORS,
  propsSchemaFor,
  subjectSubEditor,
  type NodeType,
} from '@vitae/core';
import { FieldRenderer, type AnyControl, type AnyRegister } from './FieldRenderer.js';
import { EdgeSubEditorRow, newDraftKey, type ConnectionDraft } from './EdgeSubEditorRow.js';
import { SubjectPicker, useSelfPerson, type SubjectChoice } from './SubjectPicker.js';
import { ConnectionComposer } from './ConnectionComposer.js';

export interface EntityFormValues {
  title: string;
  subtitle?: string;
  notes_md?: string;
  start_date?: string;
  end_date?: string;
  props: Record<string, unknown>;
}

export interface EntityFormSubmit {
  values: EntityFormValues;
  connections: ConnectionDraft[];
}

function buildFormZod(type: NodeType) {
  return z.object({
    title: z.string().trim().min(1, 'Required').max(500),
    subtitle: z.string().max(500).optional(),
    notes_md: z.string().optional(),
    start_date: isoDate.optional(),
    end_date: isoDate.optional(),
    props: propsSchemaFor(type),
  });
}

/** Drop empty strings / NaN / undefined and empty objects so optional Zod
 * fields don't trip on the DOM's empty-input values. */
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const s = sanitize(v);
      if (s === undefined) continue;
      if (typeof s === 'object' && !Array.isArray(s) && Object.keys(s as object).length === 0) continue;
      out[k] = s;
    }
    return out;
  }
  if (value === '' || value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return value;
}

/** Sanitize a whole form payload. `sanitize` prunes empty objects, which drops
 * `props` outright when every type-specific field is left blank, and no type's
 * props schema accepts `undefined`, so validation would fail on a path the form
 * renders no error for, leaving the submit button silently dead. */
function sanitizeValues(values: EntityFormValues): EntityFormValues {
  const out = sanitize(values) as EntityFormValues;
  return { ...out, props: out.props ?? {} };
}

export function EntityForm({
  type,
  defaultValues,
  initialConnections = [],
  submitLabel = 'Save',
  busy,
  onSubmit,
  onCancel,
  onValuesChange,
  formId,
}: {
  type: NodeType;
  defaultValues?: Partial<EntityFormValues>;
  initialConnections?: ConnectionDraft[];
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (data: EntityFormSubmit) => void | Promise<void>;
  onCancel?: () => void;
  onValuesChange?: (values: EntityFormValues) => void;
  /** When given, the form carries this id and renders no action row, the
   * caller owns the buttons and wires them with `form={formId}`. A dialog
   * puts them in its sticky footer, because a person form is 1428px tall in
   * a 692px body and the submit button was 719px past the bottom edge. */
  formId?: string;
}) {
  const descriptor = NODE_FORM_DESCRIPTORS[type];
  const [connections, setConnections] = useState<ConnectionDraft[]>(initialConnections);
  const [subjectError, setSubjectError] = useState<string | undefined>();

  // The subject rides the same connection pipeline as every other edge; only
  // its rendering differs. Identified by the descriptor's own label, which the
  // descriptor tests keep distinct from any sub-editor's.
  const subjectSub = useMemo(() => subjectSubEditor(type), [type]);
  const subjectDraft = subjectSub
    ? connections.find(
        (c) =>
          c.kind !== 'additional' &&
          c.sub.edgeType === subjectSub.edgeType &&
          c.sub.direction === subjectSub.direction &&
          c.sub.label === subjectSub.label,
      )
    : undefined;

  function setSubject(next: SubjectChoice | null) {
    if (!subjectSub) return;
    setSubjectError(undefined);
    const others = connections.filter((c) => c !== subjectDraft);
    setConnections(
      next
        ? [
            ...others,
            {
              key: subjectDraft?.key ?? newDraftKey(),
              sub: subjectSub,
              target: { id: next.id, type: 'person', title: next.title },
              props: subjectDraft?.props ?? {},
              edgeId: subjectDraft?.edgeId,
            },
          ]
        : others,
    );
  }

  // A self-preselect would be a lie on a form the user has not touched: it would
  // silently attribute someone else's record to them. Defaulting happens on
  // first render only, and only where the descriptor asks for it.
  const { data: selfPerson } = useSelfPerson();
  const [selfApplied, setSelfApplied] = useState(false);
  useEffect(() => {
    if (selfApplied || subjectDraft || !subjectSub) return;
    if (!descriptor.subject?.defaultToSelf || !selfPerson) return;
    setSelfApplied(true);
    setSubject({ id: selfPerson.id, title: selfPerson.title });
  }, [selfPerson, subjectSub, subjectDraft, selfApplied]);

  const resolver = useMemo<Resolver<EntityFormValues>>(() => {
    // The composed schema's props are dynamic per type; align it to the form's shape.
    const inner = zodResolver(buildFormZod(type)) as unknown as Resolver<EntityFormValues>;
    return (values, ctx, opts) => inner(sanitizeValues(values), ctx, opts);
  }, [type]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EntityFormValues>({
    resolver,
    defaultValues: {
      title: '',
      subtitle: '',
      notes_md: '',
      props: {},
      ...defaultValues,
    },
    // The dialog's mount sequence (Radix focus scope, then the Modal focusing
    // the first input) blurs the title field before the user reaches it, which
    // marked it touched, so with onBlur or onTouched the form opened already
    // showing "Required" on an untouched field. Nothing complains until the
    // user actually tries to submit; after that it corrects as they type. The
    // asterisk in the label carries the requirement until then.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  useEffect(() => {
    if (!onValuesChange) return;
    const subscription = watch((values) => {
      onValuesChange(sanitizeValues(values as EntityFormValues));
    });
    return () => subscription.unsubscribe();
  }, [watch, onValuesChange]);

  const sectionsWithFields = descriptor.sections
    .map((s, i) => ({
      ...s,
      fields: descriptor.fields.filter((f) => (f.section ?? descriptor.sections[0]!.id) === s.id),
      first: i === 0,
    }))
    .filter((s) => s.fields.length > 0 || s.first);

  return (
    <form
      id={formId}
      className="entity-form"
      onSubmit={handleSubmit((values) => {
        if (descriptor.subject?.required && !subjectDraft) {
          setSubjectError('Pick who this belongs to.');
          return;
        }
        return onSubmit({ values: sanitizeValues(values), connections });
      })}
      noValidate
    >
      <div className="entity-form__grid">
        <Field
          label={descriptor.titleLabel}
          required
          htmlFor="ef-title"
          error={typeof errors.title?.message === 'string' ? errors.title.message : undefined}
        >
          {/* No autoFocus: the Modal already focuses the first input, and the
              two together produced a blur on mount that failed validation
              before the user had typed a character. */}
          <Input id="ef-title" placeholder={descriptor.titlePlaceholder} {...register('title')} />
        </Field>
        {descriptor.subtitleLabel && (
          <Field label={descriptor.subtitleLabel} htmlFor="ef-subtitle">
            <Input id="ef-subtitle" {...register('subtitle')} />
          </Field>
        )}
        {descriptor.envelope.dates && (
          <div className="entity-form__dates">
            <Field label={descriptor.envelope.dateLabels?.start ?? 'Start'} htmlFor="ef-start">
              <Input
                id="ef-start"
                mono
                type="date"
                {...register('start_date', { setValueAs: (v: unknown) => (v === '' ? undefined : v) })}
              />
            </Field>
            <Field label={descriptor.envelope.dateLabels?.end ?? 'End'} htmlFor="ef-end">
              <Input
                id="ef-end"
                mono
                type="date"
                {...register('end_date', { setValueAs: (v: unknown) => (v === '' ? undefined : v) })}
              />
            </Field>
          </div>
        )}
      </div>

      {descriptor.subject && (
        <SubjectPicker
          subject={descriptor.subject}
          value={subjectDraft ? { id: subjectDraft.target.id, title: subjectDraft.target.title } : null}
          onChange={setSubject}
          error={subjectError}
        />
      )}

      {sectionsWithFields.map((section) => (
        <fieldset key={section.id} className="entity-form__section">
          {sectionsWithFields.length > 1 && (
            <legend className="entity-form__legend">{section.label}</legend>
          )}
          <div className="entity-form__grid">
            {section.fields.map((f) => (
              <div
                key={f.key}
                className={
                  f.widget === 'textarea' || f.widget === 'object-list' || f.widget === 'string-list' || f.widget === 'email-list'
                    ? 'entity-form__span'
                    : undefined
                }
              >
                <FieldRenderer
                  field={f}
                  ownerType={type}
                  control={control as unknown as AnyControl}
                  register={register as unknown as AnyRegister}
                  errors={errors as FieldErrors}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset className="entity-form__section">
        <legend className="entity-form__legend">Connections</legend>
        <div className="entity-form__edges">
          {descriptor.edges.map((sub) => (
            <EdgeSubEditorRow
              key={`${sub.edgeType}-${sub.direction}-${sub.label}`}
              sub={sub}
              drafts={connections}
              onChange={setConnections}
            />
          ))}
          <ConnectionComposer
            nodeType={type}
            drafts={connections}
            onChange={setConnections}
          />
        </div>
      </fieldset>

      <fieldset className="entity-form__section">
        <legend className="entity-form__legend">Notes</legend>
        <Textarea placeholder="Markdown notes…" {...register('notes_md')} />
      </fieldset>

      {!formId && (
        <div className="entity-form__actions">
          {onCancel && (
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
