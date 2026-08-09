import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodeType } from '@vitae/core';
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Mono,
  PageHeader,
  Select,
  Sheet,
  ErrorState,
  RegisterRule,
  SkeletonRows,
  Textarea,
} from '@vitae/ui';
import { EntityPicker } from '../components/EntityPicker.js';
import { entityHref, typeLabel } from '../lib/entity-href.js';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

type Emphasis = 'technical' | 'leadership' | 'concise' | 'detailed';
interface Variant {
  id?: string;
  emphasis: Emphasis;
  text: string;
  is_default: boolean;
}
interface NodeOption {
  id: string;
  title: string;
  type: string;
}
type AtomEvidence =
  | { kind: 'node'; node_id: string; label?: string; title?: string; node_type?: string }
  | { kind: 'url'; url: string; label?: string };
interface EvidenceNodeLink {
  node_id: string;
  title: string;
  node_type: string;
  label?: string;
}
interface Atom {
  id: string;
  rev?: number;
  kind: string;
  owner_node: string;
  owner_title?: string;
  owner_type?: string;
  metrics: Array<{ value: string | number; unit?: string; label?: string }>;
  evidence?: AtomEvidence[];
  pinned: boolean;
  blocked: boolean;
  deleted_at?: string | null;
  variants: Variant[];
  skill_ids: string[];
  skills?: Array<{ id: string; name: string }>;
}

interface EditorState {
  owner_node: string;
  kind: string;
  pinned: boolean;
  blocked: boolean;
  variants: Variant[];
  skill_ids: string[];
  metricValue: string;
  metricUnit: string;
  evidenceUrl: string;
  evidenceNodes: EvidenceNodeLink[];
}

/** Provenance records an atom can cite (FR-RES-004) - never rendered into the PDF. */
const EVIDENCE_NODE_TYPES: NodeType[] = [
  'project',
  'repository',
  'document',
  'link',
  'publication',
  'talk',
  'award',
  'post',
  'media_item',
];

const EMPHASES: Emphasis[] = ['technical', 'leadership', 'concise', 'detailed'];
const EMPTY: EditorState = {
  owner_node: '',
  kind: 'achievement',
  pinned: false,
  blocked: false,
  variants: [{ emphasis: 'technical', text: '', is_default: true }],
  skill_ids: [],
  metricValue: '',
  metricUnit: '',
  evidenceUrl: '',
  evidenceNodes: [],
};

function fromAtom(atom: Atom): EditorState {
  const metric = atom.metrics[0];
  const url = atom.evidence?.find((item) => item.kind === 'url');
  return {
    owner_node: atom.owner_node,
    kind: atom.kind,
    pinned: atom.pinned,
    blocked: atom.blocked,
    variants: atom.variants.map((variant) => ({ ...variant })),
    skill_ids: atom.skill_ids,
    metricValue: metric ? String(metric.value) : '',
    metricUnit: metric?.unit ?? '',
    evidenceUrl: url?.kind === 'url' ? url.url : '',
    evidenceNodes: (atom.evidence ?? [])
      .filter((item): item is Extract<AtomEvidence, { kind: 'node' }> => item.kind === 'node')
      .map((item) => ({
        node_id: item.node_id,
        title: item.title ?? item.label ?? item.node_id,
        node_type: item.node_type ?? 'document',
        label: item.label,
      })),
  };
}

function buildEvidencePayload(form: EditorState): AtomEvidence[] {
  const evidence: AtomEvidence[] = form.evidenceNodes.map((item) => ({
    kind: 'node' as const,
    node_id: item.node_id,
    ...(item.label ? { label: item.label } : {}),
  }));
  const url = form.evidenceUrl.trim();
  if (url) evidence.push({ kind: 'url', url });
  return evidence;
}

export function Atoms() {
  const qc = useQueryClient();
  const { flash } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [editing, setEditing] = useState<Atom | null | 'new'>(null);
  const [form, setForm] = useState<EditorState>(EMPTY);
  const [archive, setArchive] = useState<Atom | null>(null);
  const includeDeleted = stateFilter === 'archived';
  const ownerFromUrl = searchParams.get('owner') ?? '';

  const atomsQuery = useQuery({
    queryKey: ['atoms', includeDeleted, ownerFromUrl],
    queryFn: () =>
      api.get<{ atoms: Atom[]; owners?: NodeOption[] }>(
        `/atoms?includeDeleted=${includeDeleted}${ownerFromUrl ? `&owner=${encodeURIComponent(ownerFromUrl)}` : ''}`,
      ),
  });
  const catalogQuery = useQuery({
    queryKey: ['atom-skills'],
    queryFn: () => api.get<{ nodes: NodeOption[] }>('/nodes?type=skill&limit=1000'),
  });
  const data = atomsQuery.data;
  const catalog = catalogQuery.data;
  const isLoading = atomsQuery.isLoading;
  const owners = useMemo(() => {
    const owned = data?.owners ?? [];
    // Keep the currently edited owner visible even if filters change.
    if (editing && editing !== 'new' && !owned.some((node) => node.id === editing.owner_node)) {
      return [
        ...owned,
        {
          id: editing.owner_node,
          title: editing.owner_title ?? editing.owner_node,
          type: editing.owner_type ?? 'role',
        },
      ];
    }
    return owned;
  }, [data?.owners, editing]);
  const skills = useMemo(() => catalog?.nodes ?? [], [catalog]);
  /** Everything the server returned, before this screen's own filters. */
  const total = data?.atoms.length ?? 0;
  const atoms = useMemo(
    () =>
      (data?.atoms ?? []).filter((atom) => {
        if (kind && atom.kind !== kind) return false;
        if (stateFilter === 'pinned' && !atom.pinned) return false;
        if (stateFilter === 'blocked' && !atom.blocked) return false;
        if (stateFilter === 'incomplete' && atom.variants.length > 1 && atom.skill_ids.length > 0)
          return false;
        if (stateFilter === 'archived' && !atom.deleted_at) return false;
        const text =
          `${atom.owner_title ?? ''} ${atom.kind} ${atom.variants.map((v) => v.text).join(' ')}`.toLowerCase();
        return !q || text.includes(q.toLowerCase());
      }),
    [data, kind, q, stateFilter],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        owner_node: form.owner_node,
        kind: form.kind,
        pinned: form.pinned,
        blocked: form.blocked,
        variants: form.variants,
        skill_ids: form.skill_ids,
        metrics: form.metricValue
          ? [{ value: form.metricValue, unit: form.metricUnit || undefined }]
          : [],
        evidence: buildEvidencePayload(form),
        ...(editing !== 'new' && editing ? { expected_rev: editing.rev } : {}),
      };
      return editing === 'new'
        ? api.post('/atoms', payload)
        : api.patch(`/atoms/${(editing as Atom).id}`, payload);
    },
    // Failures already reach the global mutation net in main.tsx; what was
    // missing was any word on success. The dialog simply closed.
    onSuccess: async () => {
      const wasNew = editing === 'new';
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['atoms'] });
      flash(wasNew ? 'Atom created' : 'Atom saved');
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (atom: Atom) =>
      atom.deleted_at ? api.post(`/atoms/${atom.id}/restore`) : api.del(`/atoms/${atom.id}`),
    onSuccess: async (_res, atom) => {
      const wasArchived = Boolean(atom.deleted_at);
      setArchive(null);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['atoms'] });
      // Archiving is reversible and the endpoint to reverse it already exists -
      // the confirm dialog even says "Restore". There was no reason for this to
      // be a one-way door with no word said.
      flash(wasArchived ? 'Restored' : 'Archived', {
        undo: async () => {
          await (wasArchived ? api.del(`/atoms/${atom.id}`) : api.post(`/atoms/${atom.id}/restore`));
          await qc.invalidateQueries({ queryKey: ['atoms'] });
        },
      });
    },
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.post(`/atoms/${id}/duplicate`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['atoms'] });
      // A copy appeared somewhere in a two-column grid and nothing said so.
      flash('Duplicated. The copy is in your library.');
    },
  });

  function open(atom?: Atom) {
    setForm(
      atom
        ? fromAtom(atom)
        : {
            ...EMPTY,
            variants: EMPTY.variants.map((variant) => ({ ...variant })),
            evidenceNodes: [],
          },
    );
    setEditing(atom ?? 'new');
  }

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setForm({
      ...EMPTY,
      owner_node: ownerFromUrl,
      variants: EMPTY.variants.map((variant) => ({ ...variant })),
      evidenceNodes: [],
    });
    setEditing('new');
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [ownerFromUrl, searchParams, setSearchParams]);

  function updateVariant(index: number, patch: Partial<Variant>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, i) => {
        if (patch.is_default) return { ...variant, is_default: i === index };
        return i === index ? { ...variant, ...patch } : variant;
      }),
    }));
  }

  const valid = Boolean(
    form.owner_node &&
    form.variants.length &&
    form.variants.every((variant) => variant.text.trim()),
  );

  return (
    <div className="page resume-page">
      <PageHeader
        title="Atom library"
        subtitle="Create, edit, tag, and reuse the evidence-backed bullets that power every tailored résumé."
        actions={
          <Button variant="primary" onClick={() => open()}>
            New atom
          </Button>
        }
      />
      <RegisterRule />

      <div className="resume-toolbar card">
        <Input
          aria-label="Search atoms"
          placeholder="Search bullet text or owner…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          value={kind || undefined}
          onChange={(value) => setKind(value ?? '')}
          label="Filter by kind"
          placeholder="All kinds"
          options={[
            { value: 'achievement', label: 'Achievements' },
            { value: 'responsibility', label: 'Responsibilities' },
            { value: 'summary_fragment', label: 'Summary fragments' },
            { value: 'skill_line', label: 'Skill lines' },
          ]}
        />
        <Select
          value={stateFilter || undefined}
          onChange={(value) => setStateFilter(value ?? '')}
          label="Filter by state"
          placeholder="All states"
          options={[
            { value: 'pinned', label: 'Pinned' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'incomplete', label: 'Needs attention' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <Mono className="u-faint">
          {atomsQuery.data ? (atoms.length === total ? `${total}` : `${atoms.length} of ${total}`) : '—'} shown
        </Mono>
      </div>

      {atomsQuery.isError ? (
        // `isError` was unread, so a failed load rendered an empty grid saying
        // "No matching atoms - create an atom here, or clear the filters": the
        // screen blaming your library for the server's fault.
        <ErrorState
          title="Couldn’t load your atom library"
          detail={(atomsQuery.error as Error | null)?.message}
          onRetry={() => void atomsQuery.refetch()}
        />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : total === 0 ? (
        // An empty library and a filter that matched nothing are different
        // situations with different ways out; one message hedged between them.
        <EmptyState
          glyph="resume"
          title="No atoms yet"
          hint="Atoms are the achievement bullets every tailored résumé is built from. Write your first one here."
          action={
            <Button variant="primary" onClick={() => open()}>
              Create atom
            </Button>
          }
        />
      ) : atoms.length === 0 ? (
        <EmptyState
          glyph="filter"
          title="No atoms match these filters"
          hint={`All ${total} of your atoms are hidden by the current search, kind or state.`}
          action={
            <Button
              onClick={() => {
                setQ('');
                setKind('');
                setStateFilter('');
              }}
            >
              Clear the filters
            </Button>
          }
        />
      ) : (
        <div className="atom-grid">
          {atoms.map((atom) => {
            const variant = atom.variants.find((item) => item.is_default) ?? atom.variants[0];
            return (
              <button className="atom-card" key={atom.id} onClick={() => open(atom)}>
                <div className="spread">
                  <div className="chips">
                    <Chip mono>{atom.kind.replace('_', ' ')}</Chip>
                    {atom.pinned && <Chip tone="accent">Pinned</Chip>}
                    {atom.blocked && <Chip>Blocked</Chip>}
                    {atom.deleted_at && <Chip>Archived</Chip>}
                  </div>
                  <span className="atom-card__edit">Edit</span>
                </div>
                <p className="atom-card__text">{variant?.text || 'No default variant'}</p>
                <div className="atom-card__owner">
                  {atom.owner_title ?? atom.owner_node} · {atom.owner_type ?? 'record'}
                </div>
                <div className="chips">
                  {atom.skills?.slice(0, 4).map((skill) => (
                    <Chip key={skill.id}>{skill.name}</Chip>
                  ))}
                  {(atom.evidence ?? []).slice(0, 3).map((item, index) =>
                    item.kind === 'node' ? (
                      <Chip key={`ev-n-${item.node_id}`} mono>
                        {item.title ?? item.label ?? 'Record'}
                      </Chip>
                    ) : (
                      <Chip key={`ev-u-${index}`} mono>
                        URL
                      </Chip>
                    ),
                  )}
                  {(atom.evidence?.length ?? 0) > 3 && (
                    <Mono className="u-faint">+{(atom.evidence?.length ?? 0) - 3} evidence</Mono>
                  )}
                  {atom.variants.length > 1 && (
                    <Mono className="u-faint">+{atom.variants.length - 1} variants</Mono>
                  )}
                  {atom.metrics.map((metric, index) => (
                    <Chip key={index} mono>
                      {metric.value}
                      {metric.unit ?? ''}
                    </Chip>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(openValue) => !openValue && setEditing(null)}
        title={editing === 'new' ? 'Create atom' : 'Edit atom'}
        wide
        footer={
          <>
            {editing !== 'new' && editing && (
              <>
                <Button variant="ghost" onClick={() => duplicate.mutate(editing.id)}>
                  Duplicate
                </Button>
                <Button variant="danger" onClick={() => setArchive(editing)}>
                  {editing.deleted_at ? 'Restore' : 'Archive'}
                </Button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save atom'}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <div className="grid-2">
            <Field
              label="Owned by"
              required
              help="Choose one of your roles or projects. Only records you own appear in the library."
            >
              <Select
                value={form.owner_node || undefined}
                onChange={(value) => setForm({ ...form, owner_node: value ?? '' })}
                placeholder={owners.length ? 'Select role or project' : 'No owned roles/projects yet'}
                options={owners.map((node) => ({
                  value: node.id,
                  label: `${node.title} · ${node.type}`,
                }))}
              />
            </Field>
            <Field label="Kind" required>
              <Select
                value={form.kind}
                clearable={false}
                onChange={(value) => setForm({ ...form, kind: value ?? 'achievement' })}
                options={[
                  { value: 'achievement', label: 'Achievement' },
                  { value: 'responsibility', label: 'Responsibility' },
                  { value: 'summary_fragment', label: 'Summary fragment' },
                  { value: 'skill_line', label: 'Skill line' },
                ]}
              />
            </Field>
          </div>
          <div className="spread">
            <h3>Wording variants</h3>
            {form.variants.length < 4 && (
              <Button
                size="sm"
                onClick={() =>
                  setForm({
                    ...form,
                    variants: [
                      ...form.variants,
                      {
                        emphasis:
                          EMPHASES.find(
                            (value) => !form.variants.some((variant) => variant.emphasis === value),
                          ) ?? 'detailed',
                        text: '',
                        is_default: false,
                      },
                    ],
                  })
                }
              >
                Add variant
              </Button>
            )}
          </div>
          {form.variants.map((variant, index) => (
            <div className="atom-variant" key={`${variant.emphasis}-${index}`}>
              <div className="atom-variant__controls">
                <Select
                  value={variant.emphasis}
                  clearable={false}
                  onChange={(value) => updateVariant(index, { emphasis: value as Emphasis })}
                  options={EMPHASES.map((value) => ({ value, label: value }))}
                />
                <Checkbox
                  checked={variant.is_default}
                  onChange={(checked) => checked && updateVariant(index, { is_default: true })}
                  label="Default"
                />
                {form.variants.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        ...form,
                        variants: form.variants
                          .filter((_, i) => i !== index)
                          .map((item, i) => ({ ...item, is_default: i === 0 })),
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <Textarea
                aria-label={`${variant.emphasis} wording`}
                value={variant.text}
                onChange={(event) => updateVariant(index, { text: event.target.value })}
                placeholder="Action + context + measurable result…"
              />
            </div>
          ))}
          <Field
            label="Skill tags"
            help="Tags strengthen deterministic matching against job descriptions."
          >
            <div className="atom-skill-picker">
              {skills.map((skill) => (
                <Checkbox
                  key={skill.id}
                  label={skill.title}
                  checked={form.skill_ids.includes(skill.id)}
                  onChange={(checked) =>
                    setForm({
                      ...form,
                      skill_ids: checked
                        ? [...form.skill_ids, skill.id]
                        : form.skill_ids.filter((id) => id !== skill.id),
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <div className="grid-2">
            <Field label="Metric">
              <Input
                placeholder="38"
                value={form.metricValue}
                onChange={(event) => setForm({ ...form, metricValue: event.target.value })}
              />
            </Field>
            <Field label="Metric unit">
              <Input
                placeholder="%, users, hours…"
                value={form.metricUnit}
                onChange={(event) => setForm({ ...form, metricUnit: event.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Evidence records"
            help="Link repos, docs, links, or projects as private provenance. Never printed on the PDF."
          >
            <div className="atom-evidence">
              {form.evidenceNodes.length > 0 && (
                <div className="chips atom-evidence__chips">
                  {form.evidenceNodes.map((item) => (
                    <span key={item.node_id} className="atom-evidence__chip">
                      <Link
                        to={entityHref(item.node_type, item.node_id)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item.title}
                      </Link>
                      <Mono className="u-faint">{typeLabel(item.node_type)}</Mono>
                      <Button
                        variant="ghost"
                        aria-label={`Remove evidence ${item.title}`}
                        onClick={() =>
                          setForm({
                            ...form,
                            evidenceNodes: form.evidenceNodes.filter(
                              (node) => node.node_id !== item.node_id,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  ))}
                </div>
              )}
              <EntityPicker
                types={EVIDENCE_NODE_TYPES}
                excludeIds={form.evidenceNodes.map((item) => item.node_id)}
                placeholder="Link a repository, document, or project…"
                onPick={(entity) => {
                  if (form.evidenceNodes.some((item) => item.node_id === entity.id)) return;
                  setForm({
                    ...form,
                    evidenceNodes: [
                      ...form.evidenceNodes,
                      {
                        node_id: entity.id,
                        title: entity.title,
                        node_type: entity.type,
                      },
                    ],
                  });
                }}
              />
            </div>
          </Field>
          <Field label="Evidence URL" help="Optional external link kept as private provenance.">
            <Input
              type="url"
              placeholder="https://…"
              value={form.evidenceUrl}
              onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })}
            />
          </Field>
          <div className="hstack">
            <Checkbox
              checked={form.pinned}
              onChange={(pinned) => setForm({ ...form, pinned })}
              label="Pin by default"
            />
            <Checkbox
              checked={form.blocked}
              onChange={(blocked) => setForm({ ...form, blocked })}
              label="Exclude by default"
            />
          </div>
          {save.error && (
            <div className="u-danger" role="alert">
              {save.error.message}
            </div>
          )}
        </div>
      </Sheet>
      <ConfirmDialog
        open={archive !== null}
        onOpenChange={(openValue) => !openValue && setArchive(null)}
        title={archive?.deleted_at ? 'Restore this atom?' : 'Archive this atom?'}
        body="Archived atoms remain recoverable and are excluded from tailoring."
        // The sheet behind this dialog has its own "Archive"/"Restore" button
        // and stays open, so both were on screen at once wearing one name -
        // and one of them is the destructive one.
        confirmLabel={archive?.deleted_at ? 'Restore atom' : 'Archive atom'}
        destructive={!archive?.deleted_at}
        busy={archiveMutation.isPending}
        onConfirm={() => archive && archiveMutation.mutate(archive)}
      />
    </div>
  );
}
