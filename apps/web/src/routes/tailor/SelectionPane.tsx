import { useMemo } from 'react';
import { Reorder } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Chip, EmptyState, Meter, Mono, Select, StatusTrace } from '@vitae/ui';
import { api } from '../../lib/api.js';
import { ScoreBreakdown } from './ScoreBreakdown.js';
import type { AtomScore, AtomView, Draft, TailorResult } from './types.js';
import { defaultVariantText } from './types.js';

interface Props {
  atoms: AtomView[];
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  tailorResult: TailorResult | null;
  scoreById: Map<string, AtomScore>;
  tailorPending: boolean;
  onRunAuto: () => void;
}

const ROW = 'flex items-start gap-2 border-b border-hairline bg-surface px-2 py-2';
const HANDLE = 'mt-0.5 shrink-0 cursor-grab text-faint select-none';

/** Bullet text at the size the pane reads it, one place to change it. */
const BULLET = 'text-sm text-ink-soft';

/** A list that reads as a list: the ruling already comes from ROW. */
const LIST = 'm-0 list-none p-0';

/** Owner groupings read as section labels, in the compact register. */
const GROUP_HEADING = 'm-0 mb-1 text-xs font-medium tracking-wide text-faint uppercase';

/** A disclosure you can actually hit, at the 32px precise-pointer floor. */
const SUMMARY = 'inline-flex min-h-[32px] cursor-pointer items-center text-xs text-muted';

/** One step of a reorder. */
function movedBy(ids: string[], index: number, delta: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  next.splice(index + delta, 0, moved!);
  return next;
}

/**
 * The keyboard's half of "drag to reorder".
 *
 * Reorder.Item ships no key handling and the ⋮⋮ handle beside it is an
 * aria-hidden span, so bullet order on the résumé, the one thing this pane
 * exists to control, was reachable by pointer only. Drag stays as the pointer
 * shortcut; these are how everyone else gets there.
 */
function MoveControls({
  what,
  index,
  count,
  onMove,
}: {
  what: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
}) {
  return (
    // A pointer down here must not also start a drag on the row.
    <span className="tailor-move" onPointerDown={(event) => event.stopPropagation()}>
      <Button
        size="sm"
        variant="ghost"
        title="Move up"
        aria-label={`Move ${what} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="Move down"
        aria-label={`Move ${what} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </Button>
    </span>
  );
}

function VariantSelect({
  atom,
  value,
  onChange,
}: {
  atom: AtomView;
  value: string;
  onChange: (emphasis: Draft['preferredEmphasis']) => void;
}) {
  if (atom.variants.length <= 1) return null;
  return (
    // The row is drag-orderable, so a pointer down on the trigger has to stop
    // short of starting a drag or the menu never opens.
    <span className="mt-1 inline-flex" onPointerDown={(event) => event.stopPropagation()}>
      <Select
        label={`Wording variant for ${atom.owner_title}`}
        value={value}
        clearable={false}
        mono
        options={atom.variants.map((variant) => ({
          value: variant.emphasis,
          label: variant.emphasis,
        }))}
        onChange={(next) => next && onChange(next as Draft['preferredEmphasis'])}
      />
    </span>
  );
}

/**
 * Middle pane: choose atoms. Auto mode runs the knapsack (pin and exclude
 * rows, drag to reorder the result); Manual mode is checkboxes over every atom
 * grouped by role/project, with the included set fully drag-orderable.
 *
 * Every row action names the bullet it belongs to. A list of thirty atoms used
 * to read out as "Pin, button. Exclude, button. Pin, button." with nothing
 * saying which bullet each pair steered; the owner Chip carried that context
 * for sighted users only.
 */
export function SelectionPane({
  atoms,
  draft,
  onDraft,
  tailorResult,
  scoreById,
  tailorPending,
  onRunAuto,
}: Props) {
  const queryClient = useQueryClient();
  const atomsById = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms]);
  const scoreChip = (id: string) => {
    const score = scoreById.get(id);
    return score ? <ScoreBreakdown score={score} /> : null;
  };

  const alwaysPin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.patch(`/atoms/${id}`, { pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['atoms'] }),
  });

  const entries = useMemo(() => tailorResult?.selection.entries ?? [], [tailorResult]);
  const orderedIds = useMemo(() => {
    // Apply the draft's atomOrder to the auto selection (listed first, in order).
    const ids = entries.map((e) => e.atomId);
    if (!draft.atomOrder.length) return ids;
    const rank = new Map(draft.atomOrder.map((id, i) => [id, i]));
    return [...ids].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  }, [entries, draft.atomOrder]);

  const toggleList = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  /** The name of the atom a row action steers, for that action's label. */
  const rowName = (id: string, fallback = 'this') =>
    `${atomsById.get(id)?.owner_title ?? fallback} bullet`;

  if (atoms.length === 0) {
    return (
      <EmptyState
        glyph="resume"
        title="No evidence to select from"
        hint="Atoms are the bullet-level record of what you did. Add a few in the Evidence library and they become selectable here."
      />
    );
  }

  // ── Auto mode ───────────────────────────────────────────────────────────────
  if (draft.mode === 'auto') {
    const selectedSet = new Set(orderedIds);
    const unselected = atoms.filter((a) => !selectedSet.has(a.id));
    return (
      <>
        {!tailorResult ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-sm text-muted">
              Auto mode scores every atom against the job description keywords and packs the best
              set onto one page.
            </p>
            <Button variant="primary" disabled={tailorPending} onClick={onRunAuto}>
              {tailorPending ? 'Selecting...' : 'Auto-select atoms'}
            </Button>
            {tailorPending && (
              <StatusTrace tone="live" label="Scoring and packing" detail="One moment" />
            )}
          </div>
        ) : (
          <>
            <div aria-busy={tailorPending || undefined}>
              <Meter
                used={tailorResult.pageEstimate.lines}
                budget={tailorResult.pageEstimate.budget}
              />
              <div className="chips my-3">
                {/* The two numbers the screen exists to move, in the one polite
                    region that reports them. The Re-run button stays outside
                    it: its own label already changes while the run is in
                    flight, and a live region would read that out as news. */}
                <span className="chips" role="status" aria-live="polite">
                  <Chip mono>{entries.length} bullets</Chip>
                  <Chip mono tone="accent">
                    {Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage
                  </Chip>
                </span>
                <Button variant="ghost" size="sm" disabled={tailorPending} onClick={onRunAuto}>
                  {tailorPending ? 'Re-selecting...' : 'Re-run'}
                </Button>
              </div>
            </div>
            {orderedIds.length === 0 ? (
              // An empty knapsack result used to be blank space under "Drag to
              // reorder", which reads as a broken render rather than an answer.
              <EmptyState
                glyph="filter"
                title="The packer selected nothing"
                hint="No atom scored against these keywords. Pin one below to force it in, or widen the target's keywords in the rail."
              />
            ) : (
              <>
                <p className="mb-2 text-xs text-faint">
                  Selected. Drag or use the arrows to reorder, pin, or exclude.
                </p>
                <Reorder.Group
                  axis="y"
                  values={orderedIds}
                  onReorder={(ids) => onDraft({ atomOrder: ids as string[] })}
                  aria-label="Selected bullets, in résumé order"
                  className={LIST}
                >
                  {orderedIds.map((id, index) => {
                    const e = entries.find((x) => x.atomId === id);
                    const a = atomsById.get(id);
                    if (!e) return null;
                    const pinnedHere = draft.pins.includes(id) || a?.pinned;
                    const name = rowName(id, e.ownerId);
                    return (
                      <Reorder.Item key={id} value={id} className="list-none">
                        <div className={ROW}>
                          <span className={HANDLE} aria-hidden>
                            ⋮⋮
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={BULLET}>{e.text}</div>
                            <div className="chips mt-1">
                              <Chip mono>{a?.owner_title ?? e.ownerId}</Chip>
                              <Mono className="text-xs text-faint">{e.lines} ln</Mono>
                              {scoreChip(id)}
                              {pinnedHere && (
                                <Chip mono tone="accent">
                                  pinned
                                </Chip>
                              )}
                            </div>
                            {a && (
                              <VariantSelect
                                atom={a}
                                value={draft.variantByAtom[id] ?? e.emphasis}
                                onChange={(emphasis) =>
                                  onDraft({
                                    variantByAtom: { ...draft.variantByAtom, [id]: emphasis },
                                  })
                                }
                              />
                            )}
                          </div>
                          <MoveControls
                            what={name}
                            index={index}
                            count={orderedIds.length}
                            onMove={(delta) =>
                              onDraft({ atomOrder: movedBy(orderedIds, index, delta) })
                            }
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-pressed={Boolean(pinnedHere)}
                            aria-label={pinnedHere ? `Unpin ${name}` : `Pin ${name}`}
                            onClick={() => onDraft({ pins: toggleList(draft.pins, id) })}
                          >
                            {pinnedHere ? 'Unpin' : 'Pin'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Exclude ${name}`}
                            onClick={() =>
                              onDraft({
                                blocks: [...draft.blocks, id],
                                pins: draft.pins.filter((p) => p !== id),
                              })
                            }
                          >
                            Exclude
                          </Button>
                        </div>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              </>
            )}

            {(unselected.length > 0 || draft.blocks.length > 0) && (
              <details className="mt-3">
                <summary className={SUMMARY}>
                  Not selected ({unselected.length}). Pin to force one in.
                </summary>
                <ul
                  className={`${LIST} mt-2 border-t border-hairline`}
                  aria-label="Atoms the packer left out"
                >
                  {unselected.map((a) => {
                    const blockedHere = draft.blocks.includes(a.id) || a.blocked;
                    const name = `${a.owner_title} bullet`;
                    return (
                      <li key={a.id} className={ROW}>
                        <div className="min-w-0 flex-1">
                          <div className={`${BULLET} ${blockedHere ? 'text-muted' : ''}`}>
                            {defaultVariantText(a)}
                          </div>
                          <div className="chips mt-1">
                            <Chip mono>{a.owner_title}</Chip>
                            {scoreChip(a.id)}
                            {blockedHere && <Chip mono>excluded</Chip>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Pin ${name}`}
                          onClick={() =>
                            onDraft({
                              pins: toggleList(draft.pins, a.id),
                              blocks: draft.blocks.filter((b) => b !== a.id),
                            })
                          }
                        >
                          Pin
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={blockedHere ? `Allow ${name}` : `Exclude ${name}`}
                          onClick={() => onDraft({ blocks: toggleList(draft.blocks, a.id) })}
                        >
                          {blockedHere ? 'Allow' : 'Exclude'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </>
        )}
      </>
    );
  }

  // ── Manual mode ─────────────────────────────────────────────────────────────
  const byOwner = new Map<string, AtomView[]>();
  for (const a of atoms) {
    (byOwner.get(a.owner_title) ?? byOwner.set(a.owner_title, []).get(a.owner_title)!).push(a);
  }
  const included = draft.include.filter((id) => atomsById.has(id));

  return (
    <>
      {tailorResult && (
        // Manual mode re-runs the page estimate 400ms after every checkbox, and
        // this branch never read tailorPending: the meter and the coverage
        // percentage simply sat at the previous answer, then jumped.
        <div aria-busy={tailorPending || undefined}>
          <Meter used={tailorResult.pageEstimate.lines} budget={tailorResult.pageEstimate.budget} />
          {tailorPending && (
            <StatusTrace
              className="mt-2"
              tone="live"
              announce={false}
              label="Re-estimating the page"
            />
          )}
          <div className="chips my-2" role="status" aria-live="polite">
            <Chip mono>{included.length} bullets</Chip>
            <Chip mono>{tailorResult.pageEstimate.pages}p est.</Chip>
            <Chip mono tone="accent">
              {Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage
            </Chip>
          </div>
        </div>
      )}

      {included.length > 0 && (
        <>
          <p className="my-2 text-xs text-faint">
            Included. Drag or use the arrows to set the order on the page.
          </p>
          <Reorder.Group
            axis="y"
            values={included}
            onReorder={(ids) => onDraft({ include: ids as string[] })}
            aria-label="Included bullets, in résumé order"
            className={`${LIST} mb-3`}
          >
            {included.map((id, index) => {
              const a = atomsById.get(id)!;
              const name = `${a.owner_title} bullet`;
              return (
                <Reorder.Item key={id} value={id} className="list-none">
                  <div className={ROW}>
                    <span className={HANDLE} aria-hidden>
                      ⋮⋮
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={BULLET}>
                        {tailorResult?.selection.entries.find((entry) => entry.atomId === id)
                          ?.text ?? defaultVariantText(a)}
                      </div>
                      <div className="chips mt-1">
                        <Chip mono>{a.owner_title}</Chip>
                        {scoreChip(id)}
                      </div>
                      <VariantSelect
                        atom={a}
                        value={
                          draft.variantByAtom[id] ??
                          a.variants.find((variant) => variant.is_default)?.emphasis ??
                          a.variants[0]!.emphasis
                        }
                        onChange={(emphasis) =>
                          onDraft({ variantByAtom: { ...draft.variantByAtom, [id]: emphasis } })
                        }
                      />
                    </div>
                    <MoveControls
                      what={name}
                      index={index}
                      count={included.length}
                      onMove={(delta) => onDraft({ include: movedBy(included, index, delta) })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${a.owner_title} bullet from this résumé`}
                      onClick={() => onDraft({ include: draft.include.filter((x) => x !== id) })}
                    >
                      Remove
                    </Button>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </>
      )}

      <p className="mb-2 text-xs text-faint">All atoms. Check one to include it.</p>
      <div className="flex flex-col gap-4">
        {[...byOwner.entries()].map(([owner, list]) => (
          <div key={owner}>
            <h3 className={GROUP_HEADING}>{owner}</h3>
            <ul className={`${LIST} border-t border-hairline`} aria-label={`Atoms from ${owner}`}>
              {list.map((a) => {
                const checked = draft.include.includes(a.id);
                // Scoped to the row being saved. `alwaysPin.isPending` alone
                // greyed out Always on every atom at once, so the list looked
                // frozen and nothing said which save was in flight; the failure
                // then surfaced at the top of a long scrolled list, far from
                // the bullet it was about.
                const saving = alwaysPin.isPending && alwaysPin.variables?.id === a.id;
                const failedHere = alwaysPin.isError && alwaysPin.variables?.id === a.id;
                return (
                  // flex-wrap so a failure drops onto its own line inside the
                  // same ruled row rather than squeezing the bullet.
                  <li key={a.id} className={`${ROW} flex-wrap`}>
                    <span className="min-w-0 flex-1">
                      <Checkbox
                        align="start"
                        checked={checked}
                        label={<span className={BULLET}>{defaultVariantText(a)}</span>}
                        onChange={(next) =>
                          onDraft({
                            include: next
                              ? [...draft.include, a.id]
                              : draft.include.filter((x) => x !== a.id),
                          })
                        }
                      />
                    </span>
                    {scoreChip(a.id)}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={Boolean(a.pinned)}
                      aria-label={
                        a.pinned
                          ? `Stop always pinning ${a.owner_title} bullet`
                          : `Always pin ${a.owner_title} bullet`
                      }
                      title={
                        a.pinned
                          ? 'Always pinned across every target. Click to clear.'
                          : 'Always pin this atom across every target.'
                      }
                      disabled={saving}
                      onClick={() => alwaysPin.mutate({ id: a.id, pinned: !a.pinned })}
                    >
                      {saving ? 'Saving...' : a.pinned ? 'Always on' : 'Always'}
                    </Button>
                    {failedHere && (
                      <StatusTrace
                        className="w-full"
                        tone="danger"
                        label="Couldn't change that pin"
                        detail="The atom is unchanged. Try again."
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
