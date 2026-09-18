import { useRef, useState, type FormEvent } from 'react';
import { createTaskCommandSchema, upsertTemplateCommandSchema } from '@vitae/core';
import { Banner, Button, Field, Input, Modal, Textarea } from '@vitae/ui';
import type { ProductivityTemplate } from './api.js';
import { templateToCreateCommand } from './commands.js';
import type { useProductivityActions } from './use-productivity-actions.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';

type Actions = ReturnType<typeof useProductivityActions>;
type SharedProps = { template?: ProductivityTemplate; actions: Actions; onClose: () => void };

export function TemplateEditor({
  template,
  actions,
  onClose,
  onSaved,
}: SharedProps & { onSaved: (name: string) => void }) {
  const initial = {
    name: template?.name ?? '',
    description: template?.description ?? '',
    kind: template?.kind ?? 'item',
    title: typeof template?.body.title === 'string' ? template.body.title : '',
    body: JSON.stringify(template?.body ?? {}, null, 2),
    advanced: false,
  };
  const [draft, setDraft] = useState(initial);
  const [baseline] = useState(initial);
  const [validation, setValidation] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const flight = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const guard = useUnsavedChanges(dirty || saving, { onClose, busy: saving });
  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidation(null);
  }
  function simpleBody() {
    // An unchanged title must not erase a non-string or absent stored value.
    if (template && draft.title === baseline.title) return template.body;
    return { ...template?.body, title: draft.title.trim() || draft.name.trim() };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (flight.current || actions.locked) return;
    let body: unknown;
    try {
      body = draft.advanced ? JSON.parse(draft.body) : simpleBody();
    } catch {
      setValidation('The task body must be valid JSON. Check quotes, commas and brackets.');
      return;
    }
    const parsed = upsertTemplateCommandSchema.shape.payload.safeParse({
      id: template?.id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      kind: draft.kind,
      body,
    });
    if (!parsed.success) {
      setValidation('Enter a name and a JSON object for the task body.');
      return;
    }
    flight.current = true;
    setSaving(true);
    setFailed(false);
    setValidation(null);
    try {
      const result = await actions.upsertTemplate(parsed.data, template?.rev);
      if (!result) {
        setFailed(true);
        return;
      }
      onSaved(parsed.data.name);
      guard.forceClose();
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <Modal
        open
        title={template ? 'Edit template' : 'New template'}
        onOpenChange={guard.onOpenChange}
        footer={
          <>
            <Button disabled={saving} onClick={guard.requestClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="template-editor"
              variant="primary"
              disabled={actions.locked || saving || (Boolean(template) && !dirty)}
            >
              {saving ? 'Saving…' : template ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      >
        <p className="prod-muted">
          Save reusable task details. Nothing is created until you use the template.
        </p>
        {actions.writeLock && <p role="status">{actions.writeLock}</p>}
        {validation && <p role="alert">{validation}</p>}
        {failed && (
          <Banner
            tone="warning"
            title={actions.conflict ? 'This template changed elsewhere' : 'Template was not saved'}
          >
            {actions.error?.message} Your draft is kept.
            {actions.conflict &&
              ' Close this editor, refresh the list and reopen the latest template before retrying.'}
          </Banner>
        )}
        <form id="template-editor" onSubmit={(event) => void save(event)}>
          <fieldset className="prod-template-fields" disabled={actions.locked || saving}>
            <Field label="Template name" htmlFor="template-name">
              <Input
                id="template-name"
                autoFocus
                required
                maxLength={200}
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="template-description">
              <Textarea
                id="template-description"
                rows={3}
                maxLength={10000}
                value={draft.description}
                onChange={(event) => update('description', event.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor="template-kind">
              <select
                id="template-kind"
                className="vt-inp"
                value={draft.kind}
                onChange={(event) =>
                  update('kind', event.target.value === 'project' ? 'project' : 'item')
                }
              >
                <option value="item">Item template</option>
                <option value="project">Project template</option>
              </select>
            </Field>
            <p className="prod-muted">
              Category organizes templates. Both categories create one task, not a project.
            </p>
            {draft.advanced ? (
              <Field label="Task body JSON" htmlFor="template-body">
                <Textarea
                  id="template-body"
                  rows={10}
                  spellCheck={false}
                  value={draft.body}
                  onChange={(event) => update('body', event.target.value)}
                />
              </Field>
            ) : (
              <>
                <Field label="Task title" htmlFor="template-title">
                  <Input
                    id="template-title"
                    value={draft.title}
                    placeholder="Defaults to the template name"
                    onChange={(event) => update('title', event.target.value)}
                  />
                </Field>
                <p className="prod-muted">
                  Other saved fields are preserved. Use the advanced body to inspect or change them.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      advanced: true,
                      body: JSON.stringify(simpleBody(), null, 2),
                    }))
                  }
                >
                  Edit advanced body
                </Button>
              </>
            )}
          </fieldset>
        </form>
      </Modal>
      {guard.prompt}
    </>
  );
}

export function TemplateApplyDialog({
  template,
  actions,
  onClose,
  onCreated,
}: Omit<SharedProps, 'template'> & {
  template: ProductivityTemplate;
  onCreated: (title: string, id?: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const guard = useUnsavedChanges(pending, { onClose, busy: pending });
  const flight = useRef(false);
  const preview = createTaskCommandSchema.safeParse(
    templateToCreateCommand(template.body, template.name),
  );
  async function create() {
    if (flight.current || actions.locked || !preview.success) return;
    flight.current = true;
    setPending(true);
    setFailed(false);
    try {
      const result = await actions.applyTemplate(template.body, template.name);
      if (!result) {
        setFailed(true);
        return;
      }
      onCreated(preview.data.payload.title, result.result.task?.id);
    } finally {
      flight.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <Modal
        open
        title="Create task from template"
        onOpenChange={guard.onOpenChange}
        footer={
          <>
            <Button disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={pending || actions.locked || !preview.success}
              onClick={() => void create()}
            >
              {pending ? 'Creating…' : 'Create task'}
            </Button>
          </>
        }
      >
        <div className="prod-template-preview">
          <p>
            From <strong>{template.name}</strong>
          </p>
          <p className="prod-muted">
            Creates one task. Only the fields below are copied; other stored fields, repeat rules
            and subtasks are not applied.
          </p>
          {actions.writeLock && <p role="status">{actions.writeLock}</p>}
          {failed && (
            <Banner tone="warning" title="Task creation was not confirmed">
              {actions.error?.message} Retry here to safely confirm the same creation.
            </Banner>
          )}
          {preview.success ? (
            <dl>
              {Object.entries(preview.data.payload)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll('_', ' ')}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <Banner tone="warning" title="This task body needs repair">
              Edit the template before using it. {preview.error.issues[0]?.path.join('.')}:{' '}
              {preview.error.issues[0]?.message}
            </Banner>
          )}
        </div>
      </Modal>
      {guard.prompt}
    </>
  );
}
