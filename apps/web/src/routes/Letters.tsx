import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Mono,
  PageHeader,
  Select,
  Sheet,
  StatusTrace,
  Textarea,
  ErrorState,
  RegisterRule,
  SkeletonRows,
} from '@vitae/ui';
import { api } from '../lib/api.js';
import { useToast } from '../features/Toast.js';

type LetterStatus = 'draft' | 'final' | 'sent';
type BlockKind = 'hook' | 'body' | 'closer';

interface LetterBlock {
  kind: BlockKind;
  atom_id?: string;
  text?: string;
}

interface Letter {
  id: string;
  target_id: string;
  resume_id?: string;
  blocks: LetterBlock[];
  status: LetterStatus;
  rev: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface Target {
  id: string;
  role_title: string;
  company?: string | null;
  deleted_at?: string | null;
}

interface ResumeRow {
  id: string;
  name: string;
  deleted_at?: string | null;
}

interface AtomRow {
  id: string;
  owner_title?: string;
  variants: Array<{ text: string; is_default?: boolean }>;
  deleted_at?: string | null;
}

const EMPTY_BLOCKS: LetterBlock[] = [
  { kind: 'hook', text: '' },
  { kind: 'body', text: '' },
  { kind: 'closer', text: '' },
];

function atomLabel(atom: AtomRow): string {
  const text = atom.variants.find((v) => v.is_default)?.text ?? atom.variants[0]?.text ?? atom.id;
  const short = text.length > 72 ? `${text.slice(0, 72)}…` : text;
  return atom.owner_title ? `${atom.owner_title} - ${short}` : short;
}

function targetLabel(target: Target): string {
  return [target.company, target.role_title].filter(Boolean).join(' - ') || target.role_title;
}

/** "Targets", "targets and atoms", "targets, outputs, and atoms". */
function listSources(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function Letters() {
  const ids = useId();
  const qc = useQueryClient();
  const { flash } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Letter | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<{
    target_id: string;
    resume_id: string;
    status: LetterStatus;
    blocks: LetterBlock[];
    expected_rev?: number;
  }>({ target_id: '', resume_id: '', status: 'draft', blocks: EMPTY_BLOCKS });
  const [archive, setArchive] = useState<Letter | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const lettersQuery = useQuery({
    queryKey: ['letters', statusFilter === 'archived'],
    queryFn: () =>
      api.get<{ letters: Letter[] }>(`/letters?includeDeleted=${statusFilter === 'archived'}`),
  });
  const lettersData = lettersQuery.data;
  const isLoading = lettersQuery.isLoading;
  /** Everything the server returned, before this screen's own filters. */
  const totalLetters = lettersData?.letters.length ?? 0;

  const targetsQuery = useQuery({
    queryKey: ['targets'],
    queryFn: () => api.get<{ targets: Target[] }>('/targets'),
  });
  const resumesQuery = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api.get<{ resumes: ResumeRow[] }>('/resumes'),
  });
  const atomsQuery = useQuery({
    queryKey: ['atoms'],
    queryFn: () => api.get<{ atoms: AtomRow[] }>('/atoms'),
  });
  const targetsData = targetsQuery.data;
  const resumesData = resumesQuery.data;
  const atomsData = atomsQuery.data;
  // Named, because "something failed" leaves the user guessing which picker
  // they are looking at an empty list in.
  const sourcesUnavailable = [
    targetsQuery.isError ? 'Targets' : null,
    resumesQuery.isError ? 'linked outputs' : null,
    atomsQuery.isError ? 'atoms' : null,
  ].filter((n): n is string => n !== null);

  const targets = useMemo(
    () => (targetsData?.targets ?? []).filter((t) => !t.deleted_at),
    [targetsData],
  );
  const resumes = useMemo(
    () => (resumesData?.resumes ?? []).filter((r) => !r.deleted_at),
    [resumesData],
  );
  const atoms = useMemo(() => (atomsData?.atoms ?? []).filter((a) => !a.deleted_at), [atomsData]);
  const targetsById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  const letters = useMemo(() => {
    return (lettersData?.letters ?? []).filter((letter) => {
      if (statusFilter === 'archived') return Boolean(letter.deleted_at);
      if (letter.deleted_at) return false;
      if (statusFilter && letter.status !== statusFilter) return false;
      const target = targetsById.get(letter.target_id);
      const hay =
        `${targetLabel(target ?? { id: '', role_title: letter.target_id })} ${letter.status}`.toLowerCase();
      return !q || hay.includes(q.toLowerCase());
    });
  }, [lettersData, statusFilter, q, targetsById]);

  const selected = letters.find((l) => l.id === selectedId) ?? null;
  const editorOpen = createOpen || editing !== null;

  function startCreate() {
    setEditing(null);
    setFormError(null);
    setDraft({
      target_id: targets[0]?.id ?? '',
      resume_id: '',
      status: 'draft',
      blocks: EMPTY_BLOCKS.map((b) => ({ ...b })),
    });
    setCreateOpen(true);
  }

  function startEdit(letter: Letter) {
    setCreateOpen(false);
    setFormError(null);
    setEditing(letter);
    setDraft({
      target_id: letter.target_id,
      resume_id: letter.resume_id ?? '',
      status: letter.status,
      blocks: letter.blocks.length
        ? letter.blocks.map((b) => ({ ...b }))
        : EMPTY_BLOCKS.map((b) => ({ ...b })),
      expected_rev: letter.rev,
    });
  }

  function closeEditor() {
    setCreateOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function updateBlock(index: number, patch: Partial<LetterBlock>) {
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  }

  function addBodyBlock() {
    setDraft((d) => {
      if (d.blocks.length >= 24) return d;
      const closerIdx = d.blocks.findIndex((b) => b.kind === 'closer');
      const next = [...d.blocks];
      const insertAt = closerIdx >= 0 ? closerIdx : next.length;
      next.splice(insertAt, 0, { kind: 'body', text: '' });
      return { ...d, blocks: next };
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const blocks = draft.blocks
        .map((block) => ({
          kind: block.kind,
          ...(block.text?.trim() ? { text: block.text.trim() } : {}),
          ...(block.atom_id ? { atom_id: block.atom_id } : {}),
        }))
        .filter((block) => block.text || block.atom_id);
      if (!draft.target_id) throw new Error('Pick a target.');
      if (blocks.length === 0) throw new Error('Add at least one block with text or an atom.');
      const body = {
        target_id: draft.target_id,
        resume_id: draft.resume_id || undefined,
        status: draft.status,
        blocks,
        ...(draft.expected_rev ? { expected_rev: draft.expected_rev } : {}),
      };
      if (editing) {
        return api.patch<{ letter: Letter }>(`/letters/${editing.id}`, body);
      }
      return api.post<{ letter: Letter }>('/letters', body);
    },
    onSuccess: async (res) => {
      const wasNew = !editing?.id;
      closeEditor();
      setSelectedId(res.letter.id);
      await qc.invalidateQueries({ queryKey: ['letters'] });
      flash(wasNew ? 'Letter created' : 'Letter saved');
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    },
  });

  const mutate = useMutation({
    mutationFn: async ({ action, letter }: { action: 'archive' | 'restore'; letter: Letter }) => {
      if (action === 'restore') return api.post(`/letters/${letter.id}/restore`);
      return api.del(`/letters/${letter.id}`);
    },
    onSuccess: async (_res, { action, letter }) => {
      setArchive(null);
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ['letters'] });
      // Silent, and one-way, though `restore` is an action in this very switch.
      flash(action === 'restore' ? 'Restored' : 'Archived', {
        undo:
          action === 'archive'
            ? async () => {
                await api.post(`/letters/${letter.id}/restore`);
                await qc.invalidateQueries({ queryKey: ['letters'] });
              }
            : undefined,
      });
    },
  });

  return (
    <div className="page resume-page">
      <PageHeader
        title="Cover letters"
        subtitle="Deterministic hook / body / closer drafts linked to a job target. No generative text."
        actions={
          <Button
            variant="primary"
            glyph="plus"
            onClick={startCreate}
            disabled={targets.length === 0}
          >
            New letter
          </Button>
        }
      />
      <RegisterRule />

      {/* A greyed-out control with no stated reason is a dead end, and a
          `title` on a disabled button is reachable by neither keyboard nor
          screen reader. The two reasons it can be greyed out are different,
          so both are said, in text, before you reach for it. */}
      {targets.length === 0 &&
        (targetsQuery.isError ? (
          <Banner
            tone="warning"
            title="Job targets could not be loaded"
            action={
              <Button size="sm" onClick={() => void targetsQuery.refetch()}>
                Try again
              </Button>
            }
          >
            A letter is always written to one, so there is nothing to write to until this load
            succeeds.
          </Banner>
        ) : (
          !targetsQuery.isLoading && (
            <Banner
              tone="info"
              title="Add a job target first"
              action={
                <Link className="vt-btn vt-btn--sm" to="/career/resume/tailor">
                  Open Tailor
                </Link>
              }
            >
              A letter is always written to one, and you have no targets yet.
            </Banner>
          )
        ))}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search letters"
          placeholder="Search by company or role…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Status filter"
          value={statusFilter || undefined}
          onChange={(value) => setStatusFilter(value ?? '')}
          placeholder="All statuses"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'final', label: 'Final' },
            { value: 'sent', label: 'Sent' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        {/* The count changes as you type with nothing moving focus, so it has
            to be announced rather than merely redrawn. */}
        <Mono className="text-xs text-muted" role="status" aria-label="Letters shown">
          {lettersQuery.data
            ? letters.length === totalLetters
              ? `${totalLetters}`
              : `${letters.length} of ${totalLetters}`
            : '—'}{' '}
          letters
        </Mono>
      </div>

      {lettersQuery.isError ? (
        // Four queries and not one read `isError`, so a failed load said "No
        // cover letters yet" and invited you to write one you may already have.
        <ErrorState
          title="Couldn’t load your cover letters"
          detail={(lettersQuery.error as Error | null)?.message}
          onRetry={() => void lettersQuery.refetch()}
        />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : totalLetters === 0 ? (
        <EmptyState
          glyph="document"
          title="No cover letters yet"
          hint="Attach a short letter to a Tailor target. Blocks can be free text or pulled from atoms."
          action={
            targets.length ? (
              <Button variant="primary" onClick={startCreate}>
                New letter
              </Button>
            ) : (
              <Link className="vt-btn vt-btn--primary" to="/career/resume/tailor">
                Add a target first
              </Link>
            )
          }
        />
      ) : letters.length === 0 ? (
        // One branch served both, so filtering your letters out of sight
        // claimed you had never written one.
        <EmptyState
          glyph="filter"
          title="No letters match these filters"
          hint={`All ${totalLetters} of your letters are hidden by the current search or status.`}
          action={
            <Button
              onClick={() => {
                setQ('');
                setStatusFilter('');
              }}
            >
              Clear the filters
            </Button>
          }
        />
      ) : (
        // A list of records is a list: it was a div of articles, so nothing
        // announced how many letters there were or which one of them this was.
        <ul className="output-list m-0 list-none p-0" aria-label="Cover letters">
          {letters.map((letter) => {
            const target = targetsById.get(letter.target_id);
            const name = target ? targetLabel(target) : letter.target_id;
            return (
              <li className="output-row" key={letter.id}>
                <button
                  className="output-row__main"
                  type="button"
                  onClick={() => setSelectedId(letter.id)}
                >
                  <div className="output-row__identity">
                    <strong>{name}</strong>
                    <span>
                      {letter.blocks.length} blocks · updated {letter.updated_at.slice(0, 10)}
                    </span>
                  </div>
                  <Chip
                    tone={
                      letter.status === 'sent' || letter.status === 'final' ? 'accent' : 'default'
                    }
                  >
                    {letter.deleted_at ? 'archived' : letter.status}
                  </Chip>
                </button>
                <div className="output-row__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    // Three rows, three buttons called "Edit". The name has to
                    // say which letter it edits.
                    aria-label={`Edit the letter to ${name}`}
                    onClick={() => startEdit(letter)}
                    disabled={Boolean(letter.deleted_at)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Details of the letter to ${name}`}
                    onClick={() => setSelectedId(letter.id)}
                  >
                    Details
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={
          selected
            ? targetLabel(targetsById.get(selected.target_id) ?? { id: '', role_title: 'Letter' })
            : 'Letter'
        }
        wide
        footer={
          selected && (
            <>
              {selected.deleted_at ? (
                <Button onClick={() => mutate.mutate({ action: 'restore', letter: selected })}>
                  Restore
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setArchive(selected)}>
                  Archive
                </Button>
              )}
              <span className="flex-1" />
              {!selected.deleted_at && (
                <Button variant="primary" onClick={() => startEdit(selected)}>
                  Edit
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Chip mono>{selected.status}</Chip>
              <Chip mono>rev {selected.rev}</Chip>
              {selected.resume_id && <Chip mono>resume linked</Chip>}
            </div>
            {mutate.isPending && (
              <StatusTrace
                tone="live"
                label={mutate.variables?.action === 'restore' ? 'Restoring letter' : 'Archiving letter'}
              />
            )}
            {selected.blocks.map((block, i) => (
              <div key={`${block.kind}-${i}`} className="letter-block-preview">
                <Mono className="text-xs text-muted">{block.kind}</Mono>
                {block.atom_id && <Chip mono>atom</Chip>}
                <p>{block.text || <span className="text-muted">Atom-only block</span>}</p>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet
        open={editorOpen}
        onOpenChange={(open) => !open && closeEditor()}
        title={editing ? 'Edit cover letter' : 'New cover letter'}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={closeEditor}>
              Cancel
            </Button>
            <span className="flex-1" />
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save letter'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* This was a `.card` with an inline colour standing in for an error
              panel. A card is a container, not a state, and the colour it
              carried was the only thing saying the save had failed. */}
          {formError && (
            <Banner tone="danger" title="This letter was not saved">
              {formError}
            </Banner>
          )}
          {/* Every option in the three pickers below comes from a query of its
              own. When one of those fails the picker is simply empty, which
              reads as "you have no targets" rather than "we could not ask". */}
          {sourcesUnavailable.length > 0 && (
            <Banner tone="warning" title="Some choices could not be loaded">
              {`${listSources(sourcesUnavailable)} could not be listed, so those pickers are empty. The rest of the letter still saves.`}
            </Banner>
          )}

          {/* Each of these was a `<label>` wrapped around a Radix Select. A
              label does not name a button, so all four comboboxes reached the
              browser with no accessible name at all. */}
          <Field label="Target" htmlFor={`${ids}-target`}>
            <Select
              id={`${ids}-target`}
              label="Target"
              value={draft.target_id || undefined}
              onChange={(value) => setDraft((d) => ({ ...d, target_id: value ?? '' }))}
              placeholder="Select target"
              options={targets.map((t) => ({ value: t.id, label: targetLabel(t) }))}
            />
          </Field>
          <Field label="Linked output" htmlFor={`${ids}-resume`} help="Optional. Ties the letter to the résumé you sent with it.">
            <Select
              id={`${ids}-resume`}
              label="Linked output"
              value={draft.resume_id || undefined}
              onChange={(value) => setDraft((d) => ({ ...d, resume_id: value ?? '' }))}
              placeholder="None"
              options={resumes.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
          <Field label="Status" htmlFor={`${ids}-status`}>
            <Select
              id={`${ids}-status`}
              label="Status"
              value={draft.status}
              clearable={false}
              onChange={(value) =>
                setDraft((d) => ({ ...d, status: (value as LetterStatus) || 'draft' }))
              }
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'final', label: 'Final' },
                { value: 'sent', label: 'Sent' },
              ]}
            />
          </Field>

          <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
            <h3 className="m-0 text-sm font-semibold text-ink-strong">Blocks</h3>
            <Button
              size="sm"
              variant="ghost"
              glyph="plus"
              onClick={addBodyBlock}
              disabled={draft.blocks.length >= 24}
            >
              Body block
            </Button>
          </div>

          {draft.blocks.map((block, index) => {
            const textId = `${ids}-block-${index}-text`;
            const atomId = `${ids}-block-${index}-atom`;
            // "body 2 of 3" rather than three controls all called "body": the
            // kind alone does not tell two body blocks apart by name.
            const bodies = draft.blocks.filter((b) => b.kind === 'body');
            const ordinal =
              block.kind === 'body' && bodies.length > 1
                ? `body ${bodies.indexOf(block) + 1} of ${bodies.length}`
                : block.kind;
            return (
              <div key={`${block.kind}-${index}`} className="letter-block-editor">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Mono className="text-xs text-muted">{ordinal}</Mono>
                  {block.kind === 'body' && bodies.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${ordinal} block`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          blocks: d.blocks.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <Field label={`${ordinal} text`} htmlFor={textId}>
                  <Textarea
                    id={textId}
                    rows={4}
                    placeholder={`${block.kind} text…`}
                    value={block.text ?? ''}
                    onChange={(e) => updateBlock(index, { text: e.target.value })}
                  />
                </Field>
                <Field label="Or pull from an atom" htmlFor={atomId}>
                  <Select
                    id={atomId}
                    label={`Atom for the ${ordinal} block`}
                    value={block.atom_id || undefined}
                    onChange={(value) => updateBlock(index, { atom_id: value || undefined })}
                    placeholder="No atom"
                    options={atoms.map((a) => ({ value: a.id, label: atomLabel(a) }))}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </Sheet>

      <ConfirmDialog
        open={Boolean(archive)}
        onOpenChange={(open) => !open && setArchive(null)}
        title="Archive this letter?"
        body="The draft stays recoverable from the Archived filter."
        confirmLabel="Archive"
        onConfirm={() => archive && mutate.mutate({ action: 'archive', letter: archive })}
      />
    </div>
  );
}
