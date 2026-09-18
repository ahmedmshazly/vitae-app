import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  upsertRuleCommandSchema,
  VITAE_TASK_STATUSES,
  type ProductivityCommand,
} from '@vitae/core';
import { Banner, Button, Field, FilterGroup, Input, Modal, PageHeader, Textarea } from '@vitae/ui';
import type { ProductivityRule } from './api.js';
import { useProductivityRules } from './api.js';
import { QueryPanel } from './QueryPanel.js';
import { useProductivityActions } from './use-productivity-actions.js';
import { useUnsavedChanges } from '../../lib/unsaved-changes.js';

type RulePayload = Extract<ProductivityCommand, { type: 'upsert_rule' }>['payload'];
const STATUSES: readonly string[] = VITAE_TASK_STATUSES;

function basicDefinition(rule?: ProductivityRule) {
  if (!rule) return { contains: '', status: 'next' };
  const parsed = upsertRuleCommandSchema.shape.payload.safeParse({
    ...rule,
    statement: rule.statement || rule.name,
  });
  if (!parsed.success) return null;
  const { condition, actions } = parsed.data;
  if (
    'kind' in condition &&
    condition.kind === 'predicate' &&
    condition.field === 'title' &&
    condition.operator === 'contains' &&
    typeof condition.value === 'string' &&
    actions.length === 1 &&
    actions[0]?.field === 'status' &&
    typeof actions[0].value === 'string' &&
    STATUSES.includes(actions[0].value)
  ) {
    return { contains: condition.value, status: actions[0].value };
  }
  return null;
}

export function AutomationScreen() {
  const list = useProductivityRules();
  const actions = useProductivityActions();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filter = params.get('state') ?? 'all';
  const rules = list.data?.rules ?? [];
  const matches = rules.filter(
    (rule) =>
      `${rule.name} ${rule.statement ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'enabled' && rule.enabled) ||
        (filter === 'disabled' && !rule.enabled)),
  );
  const [editor, setEditor] = useState<{ rule?: ProductivityRule } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const flight = useRef(false);
  function setFilter(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key === 'q' },
    );
  }
  function clearFilters() {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('q');
      next.delete('state');
      return next;
    });
  }
  async function toggle(rule: ProductivityRule) {
    if (flight.current || actions.locked) return;
    flight.current = true;
    setPendingId(rule.id);
    setNotice(null);
    try {
      const outcome = await actions.upsertRule(
        {
          id: rule.id,
          name: rule.name,
          statement: rule.statement || rule.name,
          enabled: !rule.enabled,
          condition: rule.condition as RulePayload['condition'],
          actions: rule.actions as RulePayload['actions'],
          sort_order: rule.sort_order,
        },
        rule.rev,
      );
      if (!outcome) return;
      setNotice(
        `${rule.name} ${rule.enabled ? 'disabled' : 'enabled for storage'}. Rules do not run automatically.`,
      );
      await list.refetch();
    } finally {
      flight.current = false;
      setPendingId(null);
    }
  }
  const filtered = Boolean(search || filter !== 'all');
  return (
    <div className="page prod-page prod-automation">
      <PageHeader
        title="Automation"
        subtitle="Define and organize reusable task rules."
        actions={
          <Button
            variant="primary"
            disabled={actions.locked}
            onClick={() => {
              setNotice(null);
              setEditor({});
            }}
          >
            New rule
          </Button>
        }
      />
      <p className="prod-automation-boundary">
        Rules are stored definitions only. Enabling a rule does not execute it or change tasks.
      </p>
      {actions.writeLock && (
        <p role="status" className="prod-lock">
          {actions.writeLock}
        </p>
      )}
      {!editor && actions.error && (
        <Banner
          tone="warning"
          title={actions.conflict ? 'This rule changed' : 'Rule change was not confirmed'}
        >
          {actions.error.message} Refresh the list before retrying a conflicting change.
        </Banner>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="prod-automation-tools">
        <Field label="Search rules" htmlFor="rule-search">
          <Input
            id="rule-search"
            type="search"
            value={search}
            placeholder="Find a name or statement…"
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </Field>
        <Button disabled={list.isFetching || actions.isPending} onClick={() => void list.refetch()}>
          {list.isFetching ? 'Refreshing…' : 'Refresh rules'}
        </Button>
      </div>
      <FilterGroup
        label="Rule state"
        value={filter}
        onChange={(value) => setFilter('state', value)}
        options={[
          { key: 'all', label: 'All rules' },
          { key: 'enabled', label: 'Enabled' },
          { key: 'disabled', label: 'Disabled' },
        ]}
      />
      <div className="prod-automation-count">
        <p className="prod-muted">
          {matches.length} matching · {rules.length} rules
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
          loadingLabel="Loading rules"
          errorTitle="Couldn't load rules"
          emptyTitle={filtered ? 'No matching rules' : 'No rules yet'}
          emptyHint={
            filtered
              ? 'Try another search or state filter.'
              : 'Create a named definition with an explicit condition and action.'
          }
          emptyGlyph="adjust"
          emptyAction={
            filtered ? (
              <Button onClick={clearFilters}>Show all rules</Button>
            ) : (
              <Button disabled={actions.locked} onClick={() => setEditor({})}>
                Create a rule
              </Button>
            )
          }
        >
          <ul className="prod-automation-list">
            {matches.map((rule) => {
              const basic = basicDefinition(rule);
              return (
                <li className="prod-automation-row" key={rule.id}>
                  <div>
                    <h2>{rule.name}</h2>
                    <p>{rule.statement || 'No statement saved.'}</p>
                    <p className="prod-muted">
                      {rule.enabled ? 'Enabled' : 'Disabled'} · Stored only · Revision {rule.rev}
                    </p>
                    {basic && (
                      <p className="prod-automation-definition">
                        When the title contains “{basic.contains}”, set status to {basic.status}.
                      </p>
                    )}
                    <details>
                      <summary>Stored definition</summary>
                      <pre>
                        {JSON.stringify(
                          { condition: rule.condition, actions: rule.actions },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  <div className="prod-automation-actions">
                    <Button
                      disabled={actions.isPending}
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => setEditor({ rule })}
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={actions.locked || pendingId !== null}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                      onClick={() => void toggle(rule)}
                    >
                      {pendingId === rule.id ? 'Saving…' : rule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryPanel>
      </div>
      <p className="prod-automation-footnote prod-muted">
        Rules can be edited or disabled. Deleting rules is not supported by this server.
      </p>
      {editor && (
        <RuleEditor
          key={editor.rule?.id ?? 'new'}
          rule={editor.rule}
          actions={actions}
          onClose={() => setEditor(null)}
          onSaved={(name) => {
            setNotice(`${name} saved. No tasks were changed.`);
            void list.refetch();
          }}
        />
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  actions,
  onClose,
  onSaved,
}: {
  rule?: ProductivityRule;
  actions: ReturnType<typeof useProductivityActions>;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const basic = basicDefinition(rule);
  const initial = {
    name: rule?.name ?? '',
    statement: rule?.statement ?? '',
    enabled: rule?.enabled ?? true,
    contains: basic?.contains ?? '',
    status: basic?.status ?? 'next',
    advanced: basic === null,
    condition: JSON.stringify(rule?.condition ?? {}, null, 2),
    effects: JSON.stringify(rule?.actions ?? [], null, 2),
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
  async function save(event: FormEvent) {
    event.preventDefault();
    if (flight.current || actions.locked) return;
    let condition: unknown;
    let effects: unknown;
    try {
      condition = draft.advanced
        ? JSON.parse(draft.condition)
        : { kind: 'predicate', field: 'title', operator: 'contains', value: draft.contains.trim() };
      effects = draft.advanced
        ? JSON.parse(draft.effects)
        : [{ field: 'status', value: draft.status }];
    } catch {
      setValidation('The definition must be valid JSON. Check quotes, commas and brackets.');
      return;
    }
    if (!draft.advanced && !draft.contains.trim()) {
      setValidation('Enter the title text this rule should match.');
      return;
    }
    const parsed = upsertRuleCommandSchema.shape.payload.safeParse({
      id: rule?.id,
      name: draft.name.trim(),
      statement: draft.statement.trim(),
      enabled: draft.enabled,
      condition,
      actions: effects,
      sort_order: rule?.sort_order,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setValidation(
        `${issue?.path.join('.') || 'Rule'}: ${issue?.message || 'Check the definition.'}`,
      );
      return;
    }
    flight.current = true;
    setSaving(true);
    setFailed(false);
    setValidation(null);
    try {
      const outcome = await actions.upsertRule(parsed.data, rule?.rev);
      if (!outcome) {
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
        title={rule ? 'Edit rule' : 'New rule'}
        onOpenChange={guard.onOpenChange}
        footer={
          <>
            <Button disabled={saving} onClick={guard.requestClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="rule-editor"
              disabled={actions.locked || saving || (Boolean(rule) && !dirty)}
            >
              {saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
            </Button>
          </>
        }
      >
        <p className="prod-muted">
          This saves a definition, not an executable automation. The statement is a description; the
          controls below define its behavior.
        </p>
        {actions.writeLock && <p role="status">{actions.writeLock}</p>}
        {validation && <p role="alert">{validation}</p>}
        {failed && (
          <Banner
            tone="warning"
            title={actions.conflict ? 'This rule changed elsewhere' : 'Rule was not saved'}
          >
            {actions.error?.message} Your draft is kept.
            {actions.conflict &&
              ' Close this editor, refresh the list and reopen the latest rule before retrying.'}
          </Banner>
        )}
        <form id="rule-editor" onSubmit={(event) => void save(event)}>
          <fieldset disabled={actions.locked || saving} className="prod-rule-fields">
            <Field label="Rule name" htmlFor="rule-name">
              <Input
                id="rule-name"
                required
                maxLength={200}
                autoFocus
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>
            <Field label="Statement" htmlFor="rule-statement">
              <Textarea
                id="rule-statement"
                required
                maxLength={2000}
                rows={3}
                value={draft.statement}
                onChange={(event) => update('statement', event.target.value)}
              />
            </Field>
            {draft.advanced ? (
              <>
                <p className="prod-muted">
                  Advanced definition. Existing conditions and actions are preserved until you edit
                  them.
                </p>
                <Field label="Condition JSON" htmlFor="rule-condition">
                  <Textarea
                    id="rule-condition"
                    rows={8}
                    spellCheck={false}
                    value={draft.condition}
                    onChange={(event) => update('condition', event.target.value)}
                  />
                </Field>
                <Field label="Actions JSON" htmlFor="rule-effects">
                  <Textarea
                    id="rule-effects"
                    rows={6}
                    spellCheck={false}
                    value={draft.effects}
                    onChange={(event) => update('effects', event.target.value)}
                  />
                </Field>
              </>
            ) : (
              <div className="prod-rule-behavior">
                <Field label="When the title contains" htmlFor="rule-contains">
                  <Input
                    id="rule-contains"
                    required
                    value={draft.contains}
                    onChange={(event) => update('contains', event.target.value)}
                    placeholder="For example, brief"
                  />
                </Field>
                <Field label="Set status to" htmlFor="rule-status">
                  <select
                    id="rule-status"
                    className="vt-inp"
                    value={draft.status}
                    onChange={(event) => update('status', event.target.value)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  type="button"
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      advanced: true,
                      condition: JSON.stringify(
                        {
                          kind: 'predicate',
                          field: 'title',
                          operator: 'contains',
                          value: previous.contains,
                        },
                        null,
                        2,
                      ),
                      effects: JSON.stringify(
                        [{ field: 'status', value: previous.status }],
                        null,
                        2,
                      ),
                    }))
                  }
                >
                  Edit advanced definition
                </Button>
              </div>
            )}
            <label className="prod-rule-enabled">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => update('enabled', event.target.checked)}
              />{' '}
              Enabled for storage only
            </label>
          </fieldset>
        </form>
      </Modal>
      {guard.prompt}
    </>
  );
}
