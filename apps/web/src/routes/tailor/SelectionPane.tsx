import { useMemo } from 'react';
import { Reorder } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Meter, Mono } from '@vitae/ui';
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

/**
 * Middle pane: choose atoms. Auto mode runs the knapsack (pin 📌 / block 🚫
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
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.patch(`/atoms/${id}`, { pinned }),
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

  // ── Auto mode ───────────────────────────────────────────────────────────────
  if (draft.mode === 'auto') {
    const selectedSet = new Set(orderedIds);
    const unselected = atoms.filter((a) => !selectedSet.has(a.id));
    return (
      <>
        {!tailorResult ? (
          <div className="stack" style={{ gap: 10 }}>
            <div className="u-muted">Auto mode scores every atom against the JD keywords and packs the best set to one page.</div>
            <Button variant="primary" disabled={tailorPending} onClick={onRunAuto}>
              {tailorPending ? 'Selecting…' : 'Auto-select atoms'}
            </Button>
          </div>
        ) : (
          <>
            <Meter used={tailorResult.pageEstimate.lines} budget={tailorResult.pageEstimate.budget} />
            <div className="chips" style={{ margin: '10px 0' }}>
              <Chip mono>{entries.length} bullets</Chip>
              <Chip mono tone="accent">{Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage</Chip>
              <Button variant="ghost" disabled={tailorPending} onClick={onRunAuto}>
                {tailorPending ? 'Re-selecting…' : '↻ Re-run'}
              </Button>
            </div>
            <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', marginBottom: 6 }}>
              Selected, drag to reorder, 📌 pin, ✕ exclude
            </div>
            <Reorder.Group axis="y" values={orderedIds} onReorder={(ids) => onDraft({ atomOrder: ids as string[] })} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {orderedIds.map((id) => {
                const e = entries.find((x) => x.atomId === id);
                const a = atomsById.get(id);
                if (!e) return null;
                const pinnedHere = draft.pins.includes(id) || a?.pinned;
                return (
                  <Reorder.Item key={id} value={id} style={{ listStyle: 'none' }}>
                    <div
                      className="row"
                      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderBottom: '1px solid var(--ae-border)', background: 'var(--ae-surface)', cursor: 'grab' }}
                    >
                      <span className="u-faint" style={{ userSelect: 'none' }}>⋮⋮</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 'var(--ae-text-sm)', color: 'var(--ae-fg-soft)' }}>{e.text}</div>
                        <div className="chips" style={{ marginTop: 4 }}>
                          <Chip mono>{a?.owner_title ?? e.ownerId}</Chip>
                          <Mono className="u-faint">{e.lines} ln</Mono>
                          {scoreChip(id)}
                          {pinnedHere && <Chip mono tone="accent">pinned</Chip>}
                        </div>
                        {a && a.variants.length > 1 && (
                          <select
                            className="atom-variant-select"
                            aria-label="Wording variant"
                            value={draft.variantByAtom[id] ?? e.emphasis}
                            onPointerDown={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              onDraft({
                                variantByAtom: {
                                  ...draft.variantByAtom,
                                  [id]: event.target.value as Draft['preferredEmphasis'],
                                },
                              })
                            }
                          >
                            {a.variants.map((variant) => (
                              <option key={variant.id} value={variant.emphasis}>
                                {variant.emphasis}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button title={pinnedHere ? 'Unpin for this target' : 'Pin for this target'} className="vt-chip" style={{ cursor: 'pointer' }} onClick={() => onDraft({ pins: toggleList(draft.pins, id) })}>
                          📌
                        </button>
                      <button title="Exclude for this target" className="vt-chip" style={{ cursor: 'pointer' }} onClick={() => onDraft({ blocks: [...draft.blocks, id], pins: draft.pins.filter((p) => p !== id) })}>
                          ✕
                        </button>
                    </div>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>

            {(unselected.length > 0 || draft.blocks.length > 0) && (
              <details style={{ marginTop: 10 }}>
                <summary className="u-muted" style={{ cursor: 'pointer', fontSize: 'var(--ae-text-xs)' }}>
                  Not selected ({unselected.length}), pin to force in
                </summary>
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {unselected.map((a) => {
                    const blockedHere = draft.blocks.includes(a.id) || a.blocked;
                    return (
                      <div key={a.id} className="row" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 8px', opacity: blockedHere ? 0.55 : 1 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 'var(--ae-text-xs)', color: 'var(--ae-fg-soft)' }}>{defaultVariantText(a)}</div>
                          <div className="chips" style={{ marginTop: 2 }}>
                            <Chip mono>{a.owner_title}</Chip>
                            {scoreChip(a.id)}
                            {blockedHere && <Chip mono>excluded</Chip>}
                          </div>
                        </div>
                        <button title="Pin for this target (forces selection)" className="vt-chip" style={{ cursor: 'pointer' }} onClick={() => onDraft({ pins: toggleList(draft.pins, a.id), blocks: draft.blocks.filter((b) => b !== a.id) })}>
                            📌
                          </button>
                        <button title={blockedHere ? 'Allow again' : 'Exclude for this target'} className="vt-chip" style={{ cursor: 'pointer' }} onClick={() => onDraft({ blocks: toggleList(draft.blocks, a.id) })}>
                            {blockedHere ? '↺' : '✕'}
                          </button>
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
          <div className="chips" style={{ margin: '8px 0' }}>
            <Chip mono>{included.length} bullets</Chip>
            <Chip mono>{tailorResult.pageEstimate.pages}p est.</Chip>
            <Chip mono tone="accent">{Math.round(tailorResult.selection.weightedCoverage * 100)}% coverage</Chip>
          </div>
        </>
      )}

      {included.length > 0 && (
        <>
          <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', margin: '6px 0' }}>
            Included, drag to set the order on the page
          </div>
          <Reorder.Group axis="y" values={included} onReorder={(ids) => onDraft({ include: ids as string[] })} style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
            {included.map((id) => {
              const a = atomsById.get(id)!;
              return (
                <Reorder.Item key={id} value={id} style={{ listStyle: 'none' }}>
                  <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderBottom: '1px solid var(--ae-border)', background: 'var(--ae-surface)', cursor: 'grab' }}>
                    <span className="u-faint" style={{ userSelect: 'none' }}>⋮⋮</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--ae-text-sm)', color: 'var(--ae-fg-soft)' }}>
                        {tailorResult?.selection.entries.find((entry) => entry.atomId === id)?.text ??
                          defaultVariantText(a)}
                      </div>
                      <div className="chips" style={{ marginTop: 4 }}>
                        <Chip mono>{a.owner_title}</Chip>
                        {scoreChip(id)}
                      </div>
                      {a.variants.length > 1 && (
                        <select
                          className="atom-variant-select"
                          aria-label="Wording variant"
                          value={
                            draft.variantByAtom[id] ??
                            a.variants.find((variant) => variant.is_default)?.emphasis ??
                            a.variants[0]!.emphasis
                          }
                          onPointerDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            onDraft({
                              variantByAtom: {
                                ...draft.variantByAtom,
                                [id]: event.target.value as Draft['preferredEmphasis'],
                              },
                            })
                          }
                        >
                          {a.variants.map((variant) => (
                            <option key={variant.id} value={variant.emphasis}>
                              {variant.emphasis}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button className="vt-chip" style={{ cursor: 'pointer' }} onClick={() => onDraft({ include: draft.include.filter((x) => x !== id) })}>
                      ✕
                    </button>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </>
      )}

      <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', marginBottom: 6 }}>
        All atoms, check to include
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {[...byOwner.entries()].map(([owner, list]) => (
          <div key={owner}>
            <div style={{ fontWeight: 600, fontSize: 'var(--ae-text-xs)', marginBottom: 4 }}>{owner}</div>
            <div className="stack" style={{ gap: 2 }}>
              {list.map((a) => {
                const checked = draft.include.includes(a.id);
                return (
                  <label key={a.id} className="row" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onDraft({ include: checked ? draft.include.filter((x) => x !== a.id) : [...draft.include, a.id] })}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1, fontSize: 'var(--ae-text-xs)', color: 'var(--ae-fg-soft)' }}>{defaultVariantText(a)}</span>
                    {scoreChip(a.id)}
                    <button title={a.pinned ? 'Always pinned, click to clear' : 'Always pin (persists on the atom)'}
                        className="vt-chip"
                        style={{ cursor: 'pointer', opacity: a.pinned ? 1 : 0.45 }}
                        onClick={(ev) => {
                          ev.preventDefault();
                          alwaysPin.mutate({ id: a.id, pinned: !a.pinned });
                        }}
                      >
                        ★
                      </button>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
