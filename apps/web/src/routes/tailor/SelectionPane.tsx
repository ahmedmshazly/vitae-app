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

  const entries = tailorResult?.selection.entries ?? [];
  const orderedIds = useMemo(() => {
    // Apply the draft's atomOrder to the auto selection (listed first, in order).
    const ids = entries.map((e) => e.atomId);
    if (!draft.atomOrder.length) return ids;
    const rank = new Map(draft.atomOrder.map((id, i) => [id, i]));
    return [...ids].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  }, [entries, draft.atomOrder]);

  const toggleList = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const pinFailed = alwaysPin.isError;

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
              {tailorPending ? 'Selecting…' : 'Auto-select atoms'}
            </Button>
            {tailorPending && (
              <StatusTrace tone="live" label="Scoring and packing" detail="One moment" />
            )}
          </div>
        ) : (
          <>
            <Meter
              used={tailorResult.pageEstimate.lines}
              budget={tailorResult.pageEstimate.budget}
            />
            <div className="chips my-3">
              <Chip mono>{entries.length} bullets</Chip>
              <Chip mono tone="accent">
                {Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage
              </Chip>
              <Button variant="ghost" size="sm" disabled={tailorPending} onClick={onRunAuto}>
                {tailorPending ? 'Re-selecting…' : 'Re-run'}
              </Button>
            </div>
            <p className="mb-2 text-xs text-faint">Selected. Drag to reorder, pin, or exclude.</p>
            <Reorder.Group
              axis="y"
              values={orderedIds}
              onReorder={(ids) => onDraft({ atomOrder: ids as string[] })}
              className="m-0 list-none p-0"
            >
              {orderedIds.map((id) => {
                const e = entries.find((x) => x.atomId === id);
                const a = atomsById.get(id);
                if (!e) return null;
                const pinnedHere = draft.pins.includes(id) || a?.pinned;
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
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-pressed={Boolean(pinnedHere)}
                        onClick={() => onDraft({ pins: toggleList(draft.pins, id) })}
                      >
                        {pinnedHere ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
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

            {(unselected.length > 0 || draft.blocks.length > 0) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted">
                  Not selected ({unselected.length}). Pin to force one in.
                </summary>
                <div className="mt-2 border-t border-hairline">
                  {unselected.map((a) => {
                    const blockedHere = draft.blocks.includes(a.id) || a.blocked;
                    return (
                      <div key={a.id} className={ROW}>
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
                          onClick={() => onDraft({ blocks: toggleList(draft.blocks, a.id) })}
                        >
                          {blockedHere ? 'Allow' : 'Exclude'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
        <>
          <Meter used={tailorResult.pageEstimate.lines} budget={tailorResult.pageEstimate.budget} />
          <div className="chips my-2">
            <Chip mono>{included.length} bullets</Chip>
            <Chip mono>{tailorResult.pageEstimate.pages}p est.</Chip>
            <Chip mono tone="accent">
              {Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage
            </Chip>
          </div>
        </>
      )}

      {included.length > 0 && (
        <>
          <p className="my-2 text-xs text-faint">Included. Drag to set the order on the page.</p>
          <Reorder.Group
            axis="y"
            values={included}
            onReorder={(ids) => onDraft({ include: ids as string[] })}
            className="m-0 mb-3 list-none p-0"
          >
            {included.map((id) => {
              const a = atomsById.get(id)!;
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
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${a.owner_title} bullet from this résumé`}
                      onClick={() =>
                        onDraft({ include: draft.include.filter((x) => x !== id) })
                      }
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

      {pinFailed && (
        <StatusTrace
          className="mb-2"
          tone="danger"
          label="Couldn’t change that pin"
          detail="The atom is unchanged. Try again."
        />
      )}

      <p className="mb-2 text-xs text-faint">All atoms. Check one to include it.</p>
      <div className="flex flex-col gap-4">
        {[...byOwner.entries()].map(([owner, list]) => (
          <div key={owner}>
            <h3 className="m-0 mb-1 text-xs font-medium text-ink">{owner}</h3>
            <div className="border-t border-hairline">
              {list.map((a) => {
                const checked = draft.include.includes(a.id);
                return (
                  <div key={a.id} className={ROW}>
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
                      title={
                        a.pinned
                          ? 'Always pinned across every target. Click to clear.'
                          : 'Always pin this atom across every target.'
                      }
                      disabled={alwaysPin.isPending}
                      onClick={() => alwaysPin.mutate({ id: a.id, pinned: !a.pinned })}
                    >
                      {a.pinned ? 'Always on' : 'Always'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
