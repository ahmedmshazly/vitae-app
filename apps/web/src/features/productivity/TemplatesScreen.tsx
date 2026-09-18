import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Field, FilterGroup, Input, PageHeader } from '@vitae/ui';
import { useProductivityTemplates, type ProductivityTemplate } from './api.js';
import { QueryPanel } from './QueryPanel.js';
import { TemplateEditor, TemplateApplyDialog } from './TemplateDialogs.js';
import { useProductivityActions } from './use-productivity-actions.js';

export function TemplatesScreen() {
  const list = useProductivityTemplates();
  const actions = useProductivityActions();
  const [params, setParams] = useSearchParams();
  // Router transitions can lag a fast second input. Compose changes against
  // the latest requested filters, not an earlier rendered URL snapshot.
  const latestParams = useRef(params);
  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  const search = params.get('q') ?? '';
  const kind = params.get('kind') ?? 'all';
  const [limit, setLimit] = useState(20);
  const [editor, setEditor] = useState<{ template?: ProductivityTemplate } | null>(null);
  const [applying, setApplying] = useState<ProductivityTemplate | null>(null);
  const [notice, setNotice] = useState<{ text: string; taskId?: string } | null>(null);
  const templates = list.data?.templates ?? [];
  const matches = templates.filter(
    (template) =>
      (kind === 'all' || template.kind === kind) &&
      `${template.name} ${template.description ?? ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  function filter(key: string, value: string) {
    setLimit(20);
    const next = new URLSearchParams(latestParams.current);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    latestParams.current = next;
    setParams(next, { replace: key === 'q' });
  }
  function clearFilters() {
    setLimit(20);
    const next = new URLSearchParams(latestParams.current);
    next.delete('q');
    next.delete('kind');
    latestParams.current = next;
    setParams(next);
  }
  const filtered = Boolean(search || kind !== 'all');
  return (
    <div className="page prod-page prod-templates">
      <PageHeader
        title="Task templates"
        subtitle="Save a starting point for work you do often."
        actions={
          <Button variant="primary" disabled={actions.locked} onClick={() => setEditor({})}>
            New template
          </Button>
        }
      />
      {actions.writeLock && (
        <p role="status" className="prod-lock">
          {actions.writeLock}
        </p>
      )}
      {notice && (
        <p role="status">
          {notice.text}{' '}
          {notice.taskId && (
            <Link to={`/n/${encodeURIComponent(notice.taskId)}`}>Open created task</Link>
          )}
        </p>
      )}
      <div className="prod-template-tools">
        <Field label="Search templates" htmlFor="template-search">
          <Input
            id="template-search"
            type="search"
            value={search}
            placeholder="Find a name or description…"
            onChange={(event) => filter('q', event.target.value)}
          />
        </Field>
        <Button disabled={list.isFetching || actions.isPending} onClick={() => void list.refetch()}>
          {list.isFetching ? 'Refreshing…' : 'Refresh templates'}
        </Button>
      </div>
      <FilterGroup
        label="Template category"
        value={kind}
        onChange={(value) => filter('kind', value)}
        options={[
          { key: 'all', label: 'All templates' },
          { key: 'item', label: 'Item' },
          { key: 'project', label: 'Project' },
        ]}
      />
      <div className="prod-template-count">
        <p className="prod-muted">
          {matches.length} matching · {templates.length}{' '}
          {templates.length === 1 ? 'template' : 'templates'}
        </p>
        {filtered && (
          <Button size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={matches.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading templates"
          errorTitle="Couldn't load templates"
          emptyTitle={filtered ? 'No matching templates' : 'No templates yet'}
          emptyHint={
            filtered
              ? 'Try another search or category.'
              : 'Create a template, then preview the task before adding it to your workspace.'
          }
          emptyGlyph="task"
          emptyAction={
            filtered ? (
              <Button onClick={clearFilters}>Show all templates</Button>
            ) : (
              <Button disabled={actions.locked} onClick={() => setEditor({})}>
                Create a template
              </Button>
            )
          }
        >
          <ul className="prod-template-list">
            {matches.slice(0, limit).map((template) => (
              <li key={template.id} className="prod-template-row">
                <div>
                  <h2>{template.name}</h2>
                  <p>{template.description || 'No description saved.'}</p>
                  <p className="prod-muted">
                    {template.kind === 'project' ? 'Project' : 'Item'} template · Revision{' '}
                    {template.rev}
                  </p>
                  <p>
                    Creates one task:{' '}
                    <strong>
                      {typeof template.body.title === 'string' && template.body.title.trim()
                        ? template.body.title
                        : template.name}
                    </strong>
                  </p>
                  <details>
                    <summary>Stored task body</summary>
                    <pre>{JSON.stringify(template.body, null, 2)}</pre>
                  </details>
                </div>
                <div className="prod-template-actions">
                  <Button
                    aria-label={`Edit ${template.name}`}
                    disabled={actions.isPending}
                    onClick={() => setEditor({ template })}
                  >
                    Edit
                  </Button>
                  <Button
                    aria-label={`Use ${template.name}`}
                    disabled={actions.locked}
                    onClick={() => setApplying(template)}
                  >
                    Use template
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {matches.length > limit && (
            <Button onClick={() => setLimit((value) => value + 20)}>Show more templates</Button>
          )}
        </QueryPanel>
      </div>
      <p className="prod-muted prod-template-footnote">
        Both categories create a single task, not a project or a set of subtasks. Deleting templates
        is not supported by this server.
      </p>
      {editor && (
        <TemplateEditor
          key={editor.template?.id ?? 'new'}
          template={editor.template}
          actions={actions}
          onClose={() => setEditor(null)}
          onSaved={(name) => {
            setNotice({ text: `${name} saved.` });
            void list.refetch();
          }}
        />
      )}
      {applying && (
        <TemplateApplyDialog
          template={applying}
          actions={actions}
          onClose={() => setApplying(null)}
          onCreated={(title, taskId) => {
            setNotice({ text: `Created “${title}”.`, taskId });
            setApplying(null);
          }}
        />
      )}
    </div>
  );
}
