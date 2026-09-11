import { useState, type FormEvent } from 'react';
import type { ProductivityCommand } from '@vitae/core';
import { Banner, Button, Field, Input, PageHeader, Row, Textarea } from '@vitae/ui';
import type { ProductivityRule } from './api.js';
import { useProductivityRules } from './api.js';
import { QueryPanel } from './QueryPanel.js';
import { useProductivityActions } from './use-productivity-actions.js';

function conditionText(condition: unknown): string {
  if (condition == null) return 'No condition.';
  if (typeof condition === 'object' && !('kind' in condition)) return 'No condition (matches nothing).';
  return JSON.stringify(condition);
}

function actionsText(actions: unknown[]): string {
  if (!actions.length) return 'No actions.';
  return actions
    .map((action) => {
      if (action && typeof action === 'object' && 'field' in action) {
        const row = action as { field: string; value: unknown };
        return `${row.field} → ${JSON.stringify(row.value)}`;
      }
      return JSON.stringify(action);
    })
    .join('; ');
}

export function AutomationScreen() {
  const list = useProductivityRules();
  const actions = useProductivityActions();
  const rules = list.data?.rules ?? [];
  const [name, setName] = useState('');
  const [statement, setStatement] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !statement.trim()) return;
    await actions.upsertRule({
      name: name.trim(),
      statement: statement.trim(),
      enabled: true,
      condition: { kind: 'predicate', field: 'title', operator: 'contains', value: name.trim() },
      actions: [{ field: 'status', value: 'next' }],
    });
    setName('');
    setStatement('');
    await list.refetch();
  }

  async function toggle(rule: ProductivityRule) {
    await actions.upsertRule(
      {
        id: rule.id,
        name: rule.name,
        statement: rule.statement ?? rule.name,
        enabled: !rule.enabled,
        condition: (rule.condition ?? {}) as Extract<ProductivityCommand, { type: 'upsert_rule' }>['payload']['condition'],
        actions: (Array.isArray(rule.actions) ? rule.actions : []) as Extract<
          ProductivityCommand,
          { type: 'upsert_rule' }
        >['payload']['actions'],
      },
      rule.rev,
    );
    await list.refetch();
  }

  return (
    <div className="page prod-page">
      <PageHeader
        title="Automation"
        subtitle="Rules as named sentences. Enabled rules are stored; they are not auto-executed (FR-PROD-005)."
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
        <Field label="Rule name" htmlFor="prod-rule-name">
          <Input
            id="prod-rule-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={actions.locked}
          />
        </Field>
        <Field label="Statement" htmlFor="prod-rule-statement">
          <Textarea
            id="prod-rule-statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            disabled={actions.locked}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={actions.locked || !name.trim() || !statement.trim()}>
          Create rule
        </Button>
      </form>
      <div data-productivity-region="ready">
        <QueryPanel
          isLoading={list.isLoading}
          isError={list.isError}
          error={list.error}
          hasData={rules.length > 0}
          onRetry={() => void list.refetch()}
          loadingLabel="Loading rules"
          errorTitle="Couldn't load rules"
          emptyTitle="No rules yet"
          emptyHint="Name a rule and write what it does. Turning it on stores it; it is not auto-executed (FR-PROD-005)."
          emptyGlyph="adjust"
        >
          <ul className="prod-list">
            {rules.map((rule) => (
              <Row
                key={rule.id}
                as="li"
                title={rule.name}
                subtitle={`${rule.enabled ? 'On' : 'Off'} · ${conditionText(rule.condition)} · ${actionsText(rule.actions)}`}
                actions={
                  <Button type="button" size="sm" disabled={actions.locked} onClick={() => void toggle(rule)}>
                    {rule.enabled ? 'Turn off' : 'Turn on'}
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
