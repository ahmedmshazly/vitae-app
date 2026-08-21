import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Mono,
  Select,
  SkeletonRows,
  StatusTrace,
  Textarea,
} from '@vitae/ui';
import { api } from '../../lib/api.js';
import type { Target } from './types.js';

const STATUS_OPTIONS = [
  { value: 'saved', label: 'Saved' },
  { value: 'active', label: 'Active' },
  { value: 'applied', label: 'Applied' },
  { value: 'closed', label: 'Closed' },
];

const KEYWORD_LIMIT = 40;

function targetSummary(target: Target): string {
  const parts = [
    target.company ?? 'No company',
    `${target.parsed?.keywords?.length ?? 0} keywords`,
  ];
  if (target.draft) parts.push('draft saved');
  if (target.deleted_at) parts.push('archived');
  return parts.join(' · ');
}

/**
 * Left rail: target (job-description) sessions. Every parse is saved, so a
 * tailoring session survives reloads, click a session to reopen it.
 */
export function TargetRail({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [roleTitle, setRoleTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [editingFields, setEditingFields] = useState(false);
  const [editRole, setEditRole] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editingKeywords, setEditingKeywords] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState<
    Array<{ term: string; weight: number; skill_id: string | null }>
  >([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const targetsQuery = useQuery({
    queryKey: ['targets', showArchived],
    queryFn: () => api.get<{ targets: Target[] }>(`/targets?includeArchived=${showArchived}`),
  });
  const targets = targetsQuery.data?.targets ?? [];
  const active = targets.find((t) => t.id === activeId) ?? null;

  const create = useMutation({
    mutationFn: () =>
      api.post<{ target: Target }>('/targets', {
        role_title: roleTitle || 'Role',
        company: company || undefined,
        jd_raw: jd,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['targets'] });
      setShowForm(false);
      setRoleTitle('');
      setCompany('');
      setJd('');
      onSelect(res.target.id);
    },
  });

  const saveKeywords = useMutation({
    mutationFn: () =>
      api.patch(`/targets/${activeId}/keywords`, {
        parsed: {
          parser_version: active?.parsed.parser_version ?? 'manual',
          keywords: keywordDraft
            .map((keyword) => ({ ...keyword, term: keyword.term.trim() }))
            .filter((keyword) => keyword.term.length > 0),
        },
      }),
    onSuccess: async () => {
      setEditingKeywords(false);
      await queryClient.invalidateQueries({ queryKey: ['targets'] });
    },
  });

  const updateTarget = useMutation({
    mutationFn: ({
      action,
      value,
      company: nextCompany,
    }: {
      action: 'status' | 'archive' | 'restore' | 'fields';
      value?: string;
      company?: string | null;
    }) => {
      if (action === 'archive') return api.del(`/targets/${activeId}`);
      if (action === 'restore') return api.post(`/targets/${activeId}/restore`);
      if (action === 'fields') {
        return api.patch(`/targets/${activeId}`, {
          role_title: value,
          company: nextCompany,
        });
      }
      return api.patch(`/targets/${activeId}`, { status: value });
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['targets'] });
      if (variables.action === 'fields') setEditingFields(false);
      if (variables.action === 'archive' && !showArchived) {
        const next = targets.find((target) => target.id !== activeId);
        if (next) onSelect(next.id);
      }
    },
  });

  const validKeywords = keywordDraft.filter((keyword) => keyword.term.trim().length > 0).length;

  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="card__title">Job targets</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New target'}
        </Button>
      </div>
      <div className="mb-3">
        <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>

      {showForm && (
        <div className="mb-4 flex flex-col gap-2 border-y border-hairline py-3">
          <Input
            aria-label="Role title"
            placeholder="Role title"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
          <Input
            aria-label="Company"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <Textarea
            aria-label="Job description"
            rows={8}
            placeholder="Paste the job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={!jd.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Parsing…' : 'Parse keywords'}
          </Button>
          {create.isError && (
            <p role="alert" className="m-0 text-xs text-danger">
              Couldn’t parse that description. {(create.error as Error | null)?.message}
            </p>
          )}
        </div>
      )}

      {targetsQuery.isError ? (
        <ErrorState
          title="Couldn’t load your job targets"
          detail={(targetsQuery.error as Error | null)?.message}
          onRetry={() => void targetsQuery.refetch()}
          retrying={targetsQuery.isFetching}
        />
      ) : targetsQuery.isLoading ? (
        <SkeletonRows rows={4} label="Loading job targets" />
      ) : targets.length === 0 && !showForm ? (
        <EmptyState
          glyph="resume"
          title="No targets yet"
          hint="Paste a job description to start tailoring."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Paste a job description
            </Button>
          }
        />
      ) : (
        <ul className="m-0 list-none border-y border-hairline p-0" aria-label="Job targets">
          {targets.map((t) => {
            const current = t.id === activeId;
            return (
              <li key={t.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={current ? 'true' : undefined}
                  className={`flex w-full min-h-[44px] flex-col items-start gap-1 border-l-2 px-3 py-2 text-left transition-colors hover:bg-raised ${
                    current ? 'border-l-accent bg-raised' : 'border-l-transparent'
                  } ${t.deleted_at ? 'text-muted' : 'text-ink'}`}
                >
                  <span className="flex w-full items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.role_title}
                    </span>
                    {current && <Mono className="shrink-0 text-xs text-accent">current</Mono>}
                  </span>
                  <Mono className="text-xs text-faint">{targetSummary(t)}</Mono>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <Select
              label="Target status"
              value={active.status ?? 'saved'}
              options={STATUS_OPTIONS}
              onChange={(value) => updateTarget.mutate({ action: 'status', value: value ?? 'saved' })}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={updateTarget.isPending}
              onClick={() =>
                updateTarget.mutate({ action: active.deleted_at ? 'restore' : 'archive' })
              }
            >
              {active.deleted_at ? 'Restore' : 'Archive'}
            </Button>
          </div>
          {updateTarget.isError && (
            <StatusTrace
              tone="danger"
              label="Couldn’t update this target"
              detail={(updateTarget.error as Error | null)?.message ?? 'Try again'}
            />
          )}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="m-0 text-xs font-medium tracking-wide text-faint uppercase">
                Role and company
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditRole(active.role_title);
                  setEditCompany(active.company ?? '');
                  setEditingFields((value) => !value);
                }}
              >
                {editingFields ? 'Cancel' : 'Edit'}
              </Button>
            </div>
            {editingFields ? (
              <div className="flex flex-col gap-2">
                <Input
                  aria-label="Role title"
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value)}
                />
                <Input
                  aria-label="Company"
                  value={editCompany}
                  onChange={(event) => setEditCompany(event.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!editRole.trim() || updateTarget.isPending}
                  onClick={() =>
                    updateTarget.mutate({
                      action: 'fields',
                      value: editRole.trim(),
                      company: editCompany.trim() || null,
                    })
                  }
                >
                  {updateTarget.isPending ? 'Saving…' : 'Save details'}
                </Button>
              </div>
            ) : (
              <p className="m-0 text-sm text-ink-soft">
                {active.role_title}
                {active.company ? ` · ${active.company}` : ''}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="m-0 text-xs font-medium tracking-wide text-faint uppercase">
                Weighted keywords
                <Mono className="ml-2 normal-case tracking-normal">
                  {active.parsed.parser_version}
                </Mono>
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setKeywordDraft(
                    active.parsed.keywords.map((keyword) => ({
                      term: keyword.term,
                      weight: keyword.weight,
                      skill_id: keyword.skill_id,
                    })),
                  );
                  setEditingKeywords((value) => !value);
                }}
              >
                {editingKeywords ? 'Cancel' : 'Edit'}
              </Button>
            </div>
            {editingKeywords ? (
              <div className="flex flex-col gap-2">
                {keywordDraft.map((keyword, index) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-2"
                    key={`${keyword.term}-${index}`}
                  >
                    <Input
                      aria-label={`Keyword ${index + 1}`}
                      value={keyword.term}
                      onChange={(event) =>
                        setKeywordDraft(
                          keywordDraft.map((item, i) =>
                            i === index ? { ...item, term: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label={`Weight for ${keyword.term || `keyword ${index + 1}`}`}
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={keyword.weight}
                      onChange={(event) =>
                        setKeywordDraft(
                          keywordDraft.map((item, i) =>
                            i === index ? { ...item, weight: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${keyword.term || `keyword ${index + 1}`}`}
                      onClick={() => setKeywordDraft(keywordDraft.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Add keyword"
                    placeholder="Add keyword"
                    value={newKeyword}
                    onChange={(event) => setNewKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        newKeyword.trim() &&
                        keywordDraft.length < KEYWORD_LIMIT
                      ) {
                        setKeywordDraft([
                          ...keywordDraft,
                          { term: newKeyword.trim(), weight: 1, skill_id: null },
                        ]);
                        setNewKeyword('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!newKeyword.trim() || keywordDraft.length >= KEYWORD_LIMIT}
                    onClick={() => {
                      setKeywordDraft([
                        ...keywordDraft,
                        { term: newKeyword.trim(), weight: 1, skill_id: null },
                      ]);
                      setNewKeyword('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <Mono className="text-xs text-faint">
                  {validKeywords}/{KEYWORD_LIMIT} keywords
                </Mono>
                {saveKeywords.isError && (
                  <StatusTrace
                    tone="danger"
                    label="Couldn’t save these keywords"
                    detail={`Weights run 0 to 10, and a target holds at most ${KEYWORD_LIMIT} terms.`}
                  />
                )}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    saveKeywords.isPending || validKeywords === 0 || keywordDraft.length > KEYWORD_LIMIT
                  }
                  onClick={() => saveKeywords.mutate()}
                >
                  {saveKeywords.isPending ? 'Saving…' : 'Save keywords'}
                </Button>
              </div>
            ) : active.parsed.keywords.length === 0 ? (
              <p className="m-0 text-xs text-faint">
                The parser found no keywords in this description. Edit to add them by hand.
              </p>
            ) : (
              <div className="chips">
                {active.parsed.keywords.map((k) => (
                  <Chip
                    key={k.term}
                    tone={k.skill_id ? 'accent' : 'default'}
                    mono
                    title={
                      k.suggested
                        ? 'Suggested: this term is not in your skill list yet'
                        : k.skill_id
                          ? 'Matches a skill you already track'
                          : 'Matched on text only'
                    }
                  >
                    {k.term} {k.weight.toFixed(1)}
                    {k.suggested ? ' (new)' : ''}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
