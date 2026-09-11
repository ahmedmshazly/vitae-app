import { useState, type FormEvent } from 'react';
import { Banner, Button, Field, Input, PageHeader, Row, Select, Textarea } from '@vitae/ui';
import { useProductivityTemplates } from './api.js';
import { QueryPanel } from './QueryPanel.js';
import { useProductivityActions } from './use-productivity-actions.js';

const KIND_OPTIONS = [
  { value: 'item', label: 'item' },
  { value: 'project', label: 'project' },
];

export function TemplatesScreen() {
  const list = useProductivityTemplates();
  const actions = useProductivityActions();
  const templates = list.data?.templates ?? [];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<string>('item');
  const [title, setTitle] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await actions.upsertTemplate({
      name: name.trim(),
      description: description.trim() || undefined,
      kind: kind === 'project' ? 'project' : 'item',
      body: { title: title.trim() || name.trim() },
    });
    setName('');
    setDescription('');
    setTitle('');
    await list.refetch();
  }

  return (
    <div className="page prod-page">
      <PageHeader
        title="Task templates"
        subtitle="A template is a named body. Applying it creates a task from that body."
      />
      {actions.locked ? (
        <p className="prod-lock" role="status">
          {actions.writeLock}
        </p>
      ) : null}
      {actions.conflict ? (
        <Banner tone="warning" title="This record changed">
          {actions.conflict}
        </Banner>
      ) : null}
      <form className="prod-create" onSubmit={(event) => void create(event)}>
        <Field label="Template name" htmlFor="prod-tpl-name">
          <Input id="prod-tpl-name" value={name} onChange={(event) => setName(event.target.value)} disabled={actions.locked} />
        </Field>
        <Field label="Description" htmlFor="prod-tpl-desc">
          <Textarea
            id="prod-tpl-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={actions.locked}
          />
        </Field>
        <Field label="Kind" htmlFor="prod-tpl-kind">
          <Select id="prod-tpl-kind" label="Kind" value={kind} onChange={(value) => setKind(value ?? 'item')} options={KIND_OPTIONS} disabled={actions.locked} />
        </Field>
        <Field label="Task title in body" htmlFor="prod-tpl-title">
          <Input
            id="prod-tpl-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={actions.locked}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={actions.locked || !name.trim()}>
          Create template
        </Button>
      </form>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={templates.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading templates"
          errorTitle="Couldn't load templates"
          emptyTitle="No templates yet"
          emptyHint="Name a template and a title. Applying it creates a task from the body."
          emptyGlyph="adjust"
        >
          <ul className="prod-list">
            {templates.map((template) => (
              <Row
                key={template.id}
                as="li"
                title={template.name}
                subtitle={`${template.kind} · ${template.description ?? 'No description'}`}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    disabled={actions.locked}
                    onClick={() => void actions.applyTemplate(template.body, template.name)}
                  >
                    Apply template
                  </Button>
                }
              />
            ))}
          </ul>
        </QueryPanel>
      </div>
    </div>
  );
}
