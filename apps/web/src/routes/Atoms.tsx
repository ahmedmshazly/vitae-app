import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodeType } from '@vitae/core';
import {
  Banner,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Mono,
  PageHeader,
  RegisterRule,
  Section,
  Select,
  Sheet,
  Skeleton,
  Stack,
  Textarea,
} from '@vitae/ui';
import { EntityPicker } from '../components/EntityPicker.js';
import { QueryBoundary, keepLastResults } from '../components/QueryBoundary.js';
import { entityHref, typeLabel } from '../lib/entity-href.js';
import { facetParam, textParam, useListParams } from '../lib/list-params.js';
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

interface AtomLibrary {
  atoms: Atom[];
  owners?: NodeOption[];
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

/**
 * Emphasis is a stored token; it is not a word to show anybody. Every option
 * list and every control name reads from this one table, so the Select, the
 * textarea's name and the stored value cannot drift into three spellings.
 */
const EMPHASIS_OPTIONS: Array<{ value: Emphasis; label: string }> = [
  { value: 'technical', label: 'Technical' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
];
const EMPHASES: Emphasis[] = EMPHASIS_OPTIONS.map((option) => option.value);
function emphasisLabel(value: Emphasis): string {
  return EMPHASIS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const KIND_OPTIONS = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'responsibility', label: 'Responsibility' },
  { value: 'summary_fragment', label: 'Summary fragment' },
  { value: 'skill_line', label: 'Skill line' },
];
function kindLabel(value: string): string {
  return KIND_OPTIONS.find((option) => option.value === value)?.label ?? value.replace('_', ' ');
}

/** The library filters, in the plural, because they name a set of rows. */
const KIND_FILTERS = [
  { value: 'achievement', label: 'Achievements' },
  { value: 'responsibility', label: 'Responsibilities' },
  { value: 'summary_fragment', label: 'Summary fragments' },
  { value: 'skill_line', label: 'Skill lines' },
];
const STATE_FILTERS = [
  { value: 'pinned', label: 'Pinned' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'incomplete', label: 'Needs attention' },
  { value: 'archived', label: 'Archived' },
];

type KindFilter = 'all' | 'achievement' | 'responsibility' | 'summary_fragment' | 'skill_line';
type StateFilter = 'all' | 'pinned' | 'blocked' | 'incomplete' | 'archived';

/**
 * The filtered view is a link. The search box and both dropdowns used to sit
 * in local state while `owner` was read off the URL two lines away, so half of
 * a filtered library could be shared and half of it could not, and the back
 * button threw the filters away.
 */
const ATOM_LIST = {
  q: textParam(),
  kind: facetParam<KindFilter>(
    ['all', 'achievement', 'responsibility', 'summary_fragment', 'skill_line'],
    'all',
  ),
  state: facetParam<StateFilter>(['all', 'pinned', 'blocked', 'incomplete', 'archived'], 'all'),
};

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

/** What one card is called, once, instead of its whole contents read as a sentence. */
function cardName(atom: Atom): string {
  const variant = atom.variants.find((item) => item.is_default) ?? atom.variants[0];
  const text = variant?.text?.trim();
  if (!text) return `${kindLabel(atom.kind)} with no default variant`;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * The shape that is actually coming: a two column grid of tall cards. The list
 * skeleton this replaces was four glyph-plus-two-lines rows, so the region
 * changed shape and height at the moment the data landed.
 */
function AtomGridSkeleton() {
  return (
    <div className="atom-grid">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded border border-hairline bg-surface p-4">
          <Skeleton width="34%" height={18} />
          <div className="mt-4 grid gap-3">
            <Skeleton height={14} />
            <Skeleton width="76%" height={14} />
            <Skeleton width="42%" height={12} />
            <Skeleton width="58%" height={18} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Atoms() {
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const list = useListParams(ATOM_LIST);
  const q = list.values.q;
  const kind = list.values.kind === 'all' ? '' : list.values.kind;
  const stateFilter = list.values.state === 'all' ? '' : list.values.state;
  const [editing, setEditing] = useState<Atom | null | 'new'>(null);
  const [form, setForm] = useState<EditorState>(EMPTY);
  const [skillFilter, setSkillFilter] = useState('');
  const [archive, setArchive] = useState<Atom | null>(null);
  const includeDeleted = stateFilter === 'archived';
  const ownerFromUrl = searchParams.get('owner') ?? '';

  const atomsQuery = useQuery({
    queryKey: ['atoms', includeDeleted, ownerFromUrl],
    queryFn: () =>
      api.get<AtomLibrary>(
        `/atoms?includeDeleted=${includeDeleted}${ownerFromUrl ? `&owner=${encodeURIComponent(ownerFromUrl)}` : ''}`,
      ),
    // Choosing "Archived" is a new query key. Without this the whole library
    // blanked to a skeleton and back on every trip in and out of that filter.
    ...keepLastResults,
  });
  const catalogQuery = useQuery({
    queryKey: ['atom-skills'],
    queryFn: () => api.get<{ nodes: NodeOption[] }>('/nodes?type=skill&limit=1000'),
  });
  const data = atomsQuery.data;
  const catalog = catalogQuery.data;
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

  const selectedSkills = useMemo(
    () => skills.filter((skill) => form.skill_ids.includes(skill.id)),
    [skills, form.skill_ids],
  );
  /**
   * Ticked tags first, then a plain substring filter. A 220px window over a
   * few hundred checkboxes hid the tags the atom already carried below the
   * fold, so confirming them meant scrolling and hunting for ticks.
   */
  const pickerSkills = useMemo(() => {
    const needle = skillFilter.trim().toLowerCase();
    const chosen = new Set(form.skill_ids);
    return skills
      .filter((skill) => !needle || skill.title.toLowerCase().includes(needle))
      .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
  }, [skills, skillFilter, form.skill_ids]);

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
    // A failure from the last atom edited is not a fact about this one.
    save.reset();
    setSkillFilter('');
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

  function toggleSkill(id: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      skill_ids: checked
        ? [...current.skill_ids, id]
        : current.skill_ids.filter((value) => value !== id),
    }));
  }

  const valid = Boolean(
    form.owner_node &&
    form.variants.length &&
    form.variants.every((variant) => variant.text.trim()),
  );

  const selectedOwner = owners.find((node) => node.id === form.owner_node);
  const ownersUnavailable = atomsQuery.isError && owners.length === 0;

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
          value={list.drafts.q}
          onChange={(event) => list.set('q', event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            list.commit('q');
          }}
        />
        {/* Radix puts `label` on the trigger as `aria-label`, and an aria-label
            overrides the button's own text, so the chosen filter was dropped
            from the name: both of these read "Filter by kind" whether or not a
            kind was picked. The name has to carry the value. */}
        <Select
          value={kind || undefined}
          onChange={(value) => list.set('kind', (value ?? 'all') as KindFilter)}
          label={`Kind: ${KIND_FILTERS.find((option) => option.value === kind)?.label ?? 'All kinds'}`}
          placeholder="All kinds"
          options={KIND_FILTERS}
        />
        <Select
          value={stateFilter || undefined}
          onChange={(value) => list.set('state', (value ?? 'all') as StateFilter)}
          label={`State: ${STATE_FILTERS.find((option) => option.value === stateFilter)?.label ?? 'All states'}`}
          placeholder="All states"
          options={STATE_FILTERS}
        />
        {/* The count changes on every keystroke with nothing moving focus, so
            redrawing it is not the same as saying it. */}
        <Mono className="u-faint" role="status" aria-live="polite" aria-label="Atoms shown">
          {atomsQuery.data ? (atoms.length === total ? `${total}` : `${atoms.length} of ${total}`) : '—'} shown
        </Mono>
      </div>

      {/* One contract for the four states, and the two failures kept apart: a
          refresh that fails after the library has already loaded is a banner
          over the rows you were reading, not a full-height error where they
          used to be. */}
      <QueryBoundary
        query={atomsQuery}
        errorTitle="Couldn’t load your atom library"
        staleErrorTitle="Couldn’t refresh your atom library"
        refreshingLabel="Refreshing your atom library"
        loading={<AtomGridSkeleton />}
        loadingLabel="Loading your atoms"
        isEmpty={() => atoms.length === 0}
        isSourceEmpty={(library) => library.atoms.length === 0}
        empty={
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
        }
        emptyFiltered={
          <EmptyState
            glyph="filter"
            title="No atoms match these filters"
            hint={`All ${total} of your atoms are hidden by the current search, kind or state.`}
            action={<Button onClick={() => list.reset()}>Clear the filters</Button>}
          />
        }
      >
        {() => (
          // A grid of records is a list. It was a bare div of buttons, each
          // holding block elements a button may not contain, and each one
          // announcing its whole contents as a single name.
          <ul className="atom-grid m-0 list-none p-0" aria-label="Atoms">
            {atoms.map((atom) => {
              const variant = atom.variants.find((item) => item.is_default) ?? atom.variants[0];
              return (
                <li key={atom.id}>
                  <button
                    type="button"
                    className="atom-card h-full"
                    aria-label={`Edit atom: ${cardName(atom)}`}
                    onClick={() => open(atom)}
                  >
                    <span className="spread">
                      <span className="chips">
                        <Chip mono>{atom.kind.replace('_', ' ')}</Chip>
                        {/* State is not taxonomy. "Blocked" means this bullet
                            is kept out of every tailored résumé, and it used
                            to render with the weight of a skill tag. */}
                        {atom.pinned && (
                          <Chip glyph="pin" tone="accent">
                            Pinned
                          </Chip>
                        )}
                        {atom.blocked && (
                          <Chip glyph="alert" tone="warning">
                            Blocked
                          </Chip>
                        )}
                        {atom.deleted_at && <Chip glyph="trash">Archived</Chip>}
                      </span>
                      <span className="atom-card__edit">Edit</span>
                    </span>
                    <span className="atom-card__text block">
                      {variant?.text || 'No default variant'}
                    </span>
                    <span className="atom-card__owner block">
                      {atom.owner_title ?? atom.owner_node} · {atom.owner_type ?? 'record'}
                    </span>
                    <span className="chips">
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
                        <Mono className="u-faint">
                          +{(atom.evidence?.length ?? 0) - 3} evidence
                        </Mono>
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
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </QueryBoundary>

      <Sheet
        open={editing !== null}
        onOpenChange={(openValue) => !openValue && setEditing(null)}
        title={editing === 'new' ? 'Create atom' : 'Edit atom'}
        wide
        footer={
          <>
            {editing !== 'new' && editing && (
              <>
                {/* The one mutation on this screen with no pending signal at
                    all: a full round trip looked like a dropped click, so the
                    second press made a second copy. */}
                <Button
                  variant="ghost"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(editing.id)}
                >
                  {duplicate.isPending ? 'Duplicating…' : 'Duplicate'}
                </Button>
                <Button variant="danger" onClick={() => setArchive(editing)}>
                  {editing.deleted_at ? 'Restore' : 'Archive'}
                </Button>
              </>
            )}
            <span className="flex-1" />
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
        <Stack gap={4}>
          {/* This was a bare div carrying `u-danger`, a class defined in no
              stylesheet, at the bottom of a long scrolling sheet: unstyled
              body text below the fold, with the Save button back to reading
              "Save atom" as if nothing had happened. */}
          {save.isError && (
            <Banner tone="danger" title="Couldn’t save this atom">
              {save.error.message}
            </Banner>
          )}
          <div className="grid-2">
            <Field
              label="Owned by"
              htmlFor={`${ids}-owner`}
              required
              help="Choose one of your roles or projects. Only records you own appear in the library."
            >
              <Select
                id={`${ids}-owner`}
                label={`Owned by: ${selectedOwner ? `${selectedOwner.title}, ${selectedOwner.type}` : 'not chosen'}`}
                value={form.owner_node || undefined}
                onChange={(value) => setForm({ ...form, owner_node: value ?? '' })}
                placeholder={
                  ownersUnavailable
                    ? 'Roles and projects could not be loaded'
                    : owners.length
                      ? 'Select role or project'
                      : 'No owned roles/projects yet'
                }
                options={owners.map((node) => ({
                  value: node.id,
                  label: `${node.title} · ${node.type}`,
                }))}
              />
            </Field>
            <Field label="Kind" htmlFor={`${ids}-kind`} required>
              <Select
                id={`${ids}-kind`}
                label={`Kind: ${kindLabel(form.kind)}`}
                value={form.kind}
                clearable={false}
                onChange={(value) => setForm({ ...form, kind: value ?? 'achievement' })}
                options={KIND_OPTIONS}
              />
            </Field>
          </div>
          <Section
            title="Wording variants"
            meta={`${form.variants.length} of 4`}
            actions={
              form.variants.length < 4 && (
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
                              (value) =>
                                !form.variants.some((variant) => variant.emphasis === value),
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
              )
            }
          >
            <Stack gap={3}>
              {form.variants.map((variant, index) => (
                <div className="atom-variant" key={`${variant.emphasis}-${index}`}>
                  <div className="atom-variant__controls">
                    {/* Four unnamed comboboxes announcing their own value:
                        "technical, combobox" said nothing about what the
                        control does or which block it belongs to. */}
                    <Select
                      label={`Variant ${index + 1} emphasis: ${emphasisLabel(variant.emphasis)}`}
                      value={variant.emphasis}
                      clearable={false}
                      onChange={(value) => updateVariant(index, { emphasis: value as Emphasis })}
                      options={EMPHASIS_OPTIONS}
                    />
                    <Checkbox
                      checked={variant.is_default}
                      onChange={(checked) => checked && updateVariant(index, { is_default: true })}
                      label={
                        <>
                          Default
                          <span className="u-visually-hidden"> wording, variant {index + 1}</span>
                        </>
                      }
                    />
                    {form.variants.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove variant ${index + 1}`}
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
                    aria-label={`${emphasisLabel(variant.emphasis)} wording, variant ${index + 1} of ${form.variants.length}`}
                    value={variant.text}
                    onChange={(event) => updateVariant(index, { text: event.target.value })}
                    placeholder="Action + context + measurable result…"
                  />
                </div>
              ))}
            </Stack>
          </Section>
          <Field
            label="Skill tags"
            help="Tags strengthen deterministic matching against job descriptions."
          >
            <Stack gap={2}>
              {/* The catalogue query was destructured for `.data` alone, so
                  while it was in flight, and for good if it failed, the picker
                  was an empty box that read as "you have no skills". Tags are
                  what job-description matching runs on. */}
              {catalogQuery.isError ? (
                <Banner
                  tone="danger"
                  title="Couldn’t load your skill catalogue"
                  action={
                    <Button size="sm" onClick={() => void catalogQuery.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  {catalogQuery.error.message} You can save this atom without tags and add them
                  later.
                </Banner>
              ) : catalogQuery.isPending ? (
                <div
                  className="atom-skill-picker"
                  role="status"
                  aria-label="Loading your skills"
                  aria-live="polite"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} height={18} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="chips">
                    <Mono className="text-xs text-muted">
                      {form.skill_ids.length} tagged of {skills.length}
                    </Mono>
                    {selectedSkills.map((skill) => (
                      <Chip key={skill.id} glyph="tag">
                        {skill.title}
                      </Chip>
                    ))}
                  </div>
                  {skills.length > 0 && (
                    <Input
                      aria-label="Filter skills"
                      placeholder="Filter skills…"
                      value={skillFilter}
                      onChange={(event) => setSkillFilter(event.target.value)}
                    />
                  )}
                  <div className="atom-skill-picker" role="group" aria-label="Skill tags">
                    {skills.length === 0 ? (
                      <span className="text-xs text-muted">
                        No skills in your library yet. Capture one and it will appear here.
                      </span>
                    ) : pickerSkills.length === 0 ? (
                      <span className="text-xs text-muted">No skills match that filter.</span>
                    ) : (
                      pickerSkills.map((skill) => (
                        <Checkbox
                          key={skill.id}
                          label={skill.title}
                          checked={form.skill_ids.includes(skill.id)}
                          onChange={(checked) => toggleSkill(skill.id, checked)}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </Stack>
          </Field>
          <div className="grid-2">
            <Field label="Metric" htmlFor={`${ids}-metric`}>
              <Input
                id={`${ids}-metric`}
                placeholder="38"
                value={form.metricValue}
                onChange={(event) => setForm({ ...form, metricValue: event.target.value })}
              />
            </Field>
            <Field label="Metric unit" htmlFor={`${ids}-metric-unit`}>
              <Input
                id={`${ids}-metric-unit`}
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
          <Field
            label="Evidence URL"
            htmlFor={`${ids}-evidence-url`}
            help="Optional external link kept as private provenance."
          >
            <Input
              id={`${ids}-evidence-url`}
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
        </Stack>
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
