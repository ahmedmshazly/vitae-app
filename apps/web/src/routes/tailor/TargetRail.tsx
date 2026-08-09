import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState } from '@vitae/ui';
import { api } from '../../lib/api.js';
import type { Target } from './types.js';

/**
 * Left rail: target (job-description) sessions. Every parse is saved, so a
 * tailoring session survives reloads - click a session to reopen it.
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

  const { data } = useQuery({
    queryKey: ['targets', showArchived],
    queryFn: () => api.get<{ targets: Target[] }>(`/targets?includeArchived=${showArchived}`),
  });
  const targets = data?.targets ?? [];
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

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 className="card__title">Job targets</h2>
        <Button variant="ghost" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New'}
        </Button>
      </div>
      <label className="target-archive-toggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />{' '}
        Show archived
      </label>

      {showForm && (
        <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Role title"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
          <input
            className="input"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <textarea
            className="textarea"
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
        </div>
      )}

      {targets.length === 0 && !showForm ? (
        <EmptyState
          glyph="resume"
          title="No targets yet"
          hint="Paste a job description to start tailoring."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>
              New target
            </Button>
          }
        />
      ) : (
        <div className="stack" style={{ gap: 4 }}>
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="row"
              style={{
                display: 'block',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: t.id === activeId ? 'var(--ae-accent)' : 'var(--ae-border)',
                background:
                  t.id === activeId
                    ? 'color-mix(in srgb, var(--ae-accent) 8%, transparent)'
                    : 'transparent',
                cursor: 'pointer',
                opacity: t.deleted_at ? 0.65 : 1,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 'var(--ae-text-sm)' }}>{t.role_title}</div>
              <div className="u-muted" style={{ fontSize: 'var(--ae-text-xs)' }}>
                {t.company ?? '—'} · {t.parsed?.keywords?.length ?? 0} keywords
                {t.draft ? ' · draft saved' : ''}
                {t.deleted_at ? ' · archived' : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div style={{ marginTop: 14 }}>
          <div className="target-status-row">
            <select
              className="input"
              aria-label="Target status"
              value={active.status ?? 'saved'}
              onChange={(event) =>
                updateTarget.mutate({ action: 'status', value: event.target.value })
              }
            >
              <option value="saved">Saved</option>
              <option value="active">Active</option>
              <option value="applied">Applied</option>
              <option value="closed">Closed</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                updateTarget.mutate({ action: active.deleted_at ? 'restore' : 'archive' })
              }
            >
              {active.deleted_at ? 'Restore' : 'Archive'}
            </Button>
          </div>

          <div className="spread" style={{ marginBottom: 6 }}>
            <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
              Role / company
            </div>
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
            <div className="target-fields">
              <input
                className="input"
                aria-label="Role title"
                value={editRole}
                onChange={(event) => setEditRole(event.target.value)}
              />
              <input
                className="input"
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
          ) : null}

          <div className="spread" style={{ marginBottom: 6 }}>
            <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
              Weighted keywords ({active.parsed.parser_version})
            </div>
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
            <div className="keyword-editor">
              {keywordDraft.map((keyword, index) => (
                <div className="keyword-editor__row" key={`${keyword.term}-${index}`}>
                  <input
                    className="input"
                    value={keyword.term}
                    onChange={(event) =>
                      setKeywordDraft(
                        keywordDraft.map((item, i) =>
                          i === index ? { ...item, term: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    className="input"
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
                  <button
                    aria-label={`Remove ${keyword.term}`}
                    onClick={() => setKeywordDraft(keywordDraft.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="keyword-editor__add">
                <input
                  className="input"
                  placeholder="Add keyword"
                  value={newKeyword}
                  onChange={(event) => setNewKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newKeyword.trim() && keywordDraft.length < 40) {
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
                  disabled={!newKeyword.trim() || keywordDraft.length >= 40}
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
              <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>
                {keywordDraft.filter((keyword) => keyword.term.trim()).length}/40 keywords
              </div>
              {saveKeywords.isError ? (
                <div className="u-muted" style={{ fontSize: 'var(--ae-text-xs)', color: 'var(--ae-danger)' }}>
                  Could not save keywords. Check weights (0-10) and the 40-term limit.
                </div>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={
                  saveKeywords.isPending ||
                  !keywordDraft.some((keyword) => keyword.term.trim().length > 0) ||
                  keywordDraft.length > 40
                }
                onClick={() => saveKeywords.mutate()}
              >
                {saveKeywords.isPending ? 'Saving…' : 'Save keywords'}
              </Button>
            </div>
          ) : (
            <div className="chips">
              {active.parsed.keywords.map((k) => (
                <Chip
                  key={k.term}
                  tone={k.skill_id ? 'accent' : 'default'}
                  mono
                  title={k.suggested ? 'novel-term suggestion' : ''}
                >
                  {k.term} {k.weight.toFixed(1)}
                  {k.suggested ? ' *' : ''}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
