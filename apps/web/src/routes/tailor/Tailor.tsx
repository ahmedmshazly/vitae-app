import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, EmptyState, InfoPopover, Mono, PageHeader, RegisterRule } from '@vitae/ui';
import { api } from '../../lib/api.js';
import { TargetRail } from './TargetRail.js';
import { SelectionPane } from './SelectionPane.js';
import { DocumentPane } from './DocumentPane.js';
import { PreviewPane } from './PreviewPane.js';
import type { AtomScore, AtomView, Draft, TailorResult, Target } from './types.js';
import { defaultDraft } from './types.js';

const MODES = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'manual' as const, label: 'Manual' },
];

function scoresMap(scores: AtomScore[] | undefined): Map<string, AtomScore> {
  return new Map((scores ?? []).map((score) => [score.atomId, score]));
}

/**
 * Tailoring workspace (SRS P15): JD → keywords → atom selection (auto knapsack
 * or fully manual with drag-and-drop) → compiled PDF → finalized output.
 * The whole configuration is a per-target draft, autosaved and restored, and
 * the active target lives in the URL (?target=...) so sessions survive reloads.
 */
export function Tailor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetId = searchParams.get('target');

  const targetsQuery = useQuery({
    queryKey: ['targets'],
    queryFn: () => api.get<{ targets: Target[] }>('/targets'),
  });
  const targetsData = targetsQuery.data;
  const target = targetsData?.targets.find((t) => t.id === targetId) ?? null;

  const atomsQuery = useQuery({
    queryKey: ['atoms'],
    queryFn: () => api.get<{ atoms: AtomView[] }>('/atoms'),
  });
  const atomsData = atomsQuery.data;
  const atoms = useMemo(() => atomsData?.atoms ?? [], [atomsData]);

  // ── Draft state: hydrated from the target, autosaved (debounced) ────────────
  const [draft, setDraft] = useState<Draft>(() => defaultDraft());
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [scoreById, setScoreById] = useState<Map<string, AtomScore>>(() => new Map());
  const hydratedFor = useRef<string | null>(null);
  const skipSave = useRef(true);

  useEffect(() => {
    if (!target || hydratedFor.current === target.id) return;
    hydratedFor.current = target.id;
    skipSave.current = true;
    const base = defaultDraft('cobalt', '');
    const saved = target.draft ?? {};
    setDraft({
      ...base,
      ...saved,
      // Older drafts predate wording/accent fields, never leave them undefined.
      accent: saved.accent ?? base.accent,
      preferredEmphasis: saved.preferredEmphasis ?? base.preferredEmphasis,
      variantByAtom: saved.variantByAtom ?? {},
    });
    setTailorResult(null);
  }, [target]);

  // Autosave was `api.patch(...).catch(() => {})`, every failure discarded in
  // silence, while the rail went on reading "draft saved" from whatever the
  // server last accepted. A connection that had stopped saving your work looked
  // exactly like one that was saving it. This is the screen where a résumé is
  // actually made; losing an hour of tailoring without a word is the worst
  // thing it can do.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [scoringFailed, setScoringFailed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A delayed save can complete after a newer one. Only the newest attempt is
  // allowed to describe the visible save state, otherwise a stale failure can
  // overwrite a successful save and make the recovery control misleading.
  const saveAttempt = useRef(0);
  const saveDraft = (id: string, nextDraft: Draft) => {
    const attempt = ++saveAttempt.current;
    setSaveState('saving');
    void api
      .patch(`/targets/${id}/draft`, { draft: nextDraft })
      .then(() => {
        if (attempt === saveAttempt.current) setSaveState('saved');
      })
      .catch(() => {
        if (attempt === saveAttempt.current) setSaveState('failed');
      });
  };

  useEffect(() => {
    if (!targetId) {
      saveAttempt.current += 1;
      setSaveState('idle');
      return;
    }
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(targetId, draft);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, targetId]);

  const onDraft = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // ── Selection runs ──────────────────────────────────────────────────────────
  const tailorRun = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TailorResult>('/resumes/tailor', body),
    onSuccess: (res) => {
      setTailorResult(res);
      setScoreById(scoresMap(res.scores));
    },
  });

  // Score every atom as soon as a target is active (FR-RES-007), independent of selection.
  const keywordSig = JSON.stringify(target?.parsed?.keywords ?? []);
  useEffect(() => {
    if (!targetId || !target) {
      if (!targetId) setScoreById(new Map());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .post<TailorResult>('/resumes/tailor', {
          targetId,
          templateKey: draft.templateKey || 'cobalt',
          mode: 'manual',
          include: [],
        })
        .then((res) => {
          if (!cancelled) {
            setScoreById(scoresMap(res.scores));
            setScoringFailed(false);
          }
        })
        // Was `.catch(() => {})`: a failed re-score left the previous target's
        // numbers on screen, attached to this target's atoms. Its own signal,
        // not the save state, scoring and saving fail for different reasons
        // and a scoring failure must not claim your work is unsaved.
        .catch(() => {
          if (!cancelled) setScoringFailed(true);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetId, target?.id, keywordSig, atoms.length]);

  const runAuto = () => {
    if (!targetId) return;
    tailorRun.mutate({
      targetId,
      templateKey: draft.templateKey,
      mode: 'auto',
      pins: draft.pins,
      blocks: draft.blocks,
      preferredEmphasis: draft.preferredEmphasis,
      variantByAtom: draft.variantByAtom,
    });
  };

  // Auto mode: re-run when pins/blocks/wording change (after an initial run exists).
  const autoDeps = JSON.stringify([
    draft.pins,
    draft.blocks,
    draft.templateKey,
    draft.preferredEmphasis,
    draft.variantByAtom,
  ]);
  const hasRun = tailorResult !== null;
  useEffect(() => {
    if (draft.mode !== 'auto' || !hasRun || !targetId) return;
    const t = setTimeout(runAuto, 300);
    return () => clearTimeout(t);
  }, [autoDeps, draft.mode]);

  // Manual mode: debounce a page-estimate run over the included set.
  const manualDeps = JSON.stringify([
    draft.include,
    draft.templateKey,
    draft.preferredEmphasis,
    draft.variantByAtom,
  ]);
  useEffect(() => {
    if (draft.mode !== 'manual' || !targetId) return;
    if (draft.include.length === 0) {
      setTailorResult(null);
      return;
    }
    const t = setTimeout(() => {
      tailorRun.mutate({
        targetId,
        templateKey: draft.templateKey,
        mode: 'manual',
        include: draft.include,
        preferredEmphasis: draft.preferredEmphasis,
        variantByAtom: draft.variantByAtom,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [manualDeps, draft.mode]);

  return (
    <div className="page max-w-[1500px]">
      <PageHeader
        title="Tailor a résumé"
        subtitle="Job description → weighted keywords → your atoms, your order → compiled PDF."
        actions={
          // The header promises "everything you change is autosaved", so the
          // header is where it has to say when that stops being true.
          saveState === 'failed' ? (
            <div role="alert" className="flex items-center gap-2 text-sm text-danger">
              <span>
                <strong className="font-semibold">Not saving.</strong> Your last changes are only in
                this tab.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => targetId && saveDraft(targetId, draft)}
              >
                Retry save
              </Button>
            </div>
          ) : saveState === 'saving' ? (
            <Mono className="text-xs text-muted">saving...</Mono>
          ) : saveState === 'saved' ? (
            <Mono className="text-xs text-faint">draft saved</Mono>
          ) : undefined
        }
        help={
          <InfoPopover title="How to make a résumé">
            <p>
              <strong>1.</strong> Pick or paste a job target (left), its description becomes
              weighted keywords.
            </p>
            <p>
              <strong>2.</strong> Choose <em>Auto</em> (scored &amp; packed to one page, pin,
              exclude, drag to reorder) or <em>Manual</em> (check exactly the atoms you want, drag
              to order them).
            </p>
            <p>
              <strong>3.</strong> Toggle and reorder résumé sections, pick a template, then{' '}
              <em>Compile</em> for a live PDF with ATS coverage.
            </p>
            <p>
              <strong>4.</strong> <em>Finalize</em> to save the output (one-page + 95% coverage
              gate) and find it under Outputs.
            </p>
            <p>Everything you change is autosaved to this target, reload and carry on.</p>
          </InfoPopover>
        }
      />
      <RegisterRule />

      {/* Neither query checked isError, so a failed load left empty panes that
          read as "you have nothing" rather than "this did not load". */}
      {scoringFailed && (
        <p role="alert" className="mb-3 text-sm text-danger">
          <strong className="font-semibold">Couldn't score your atoms against this target.</strong>{' '}
          Any numbers below are from the previous run.
        </p>
      )}

      {(targetsQuery.isError || atomsQuery.isError) && (
        <p role="alert" className="mb-3 text-sm text-danger">
          <strong className="font-semibold">
            Couldn't load your {targetsQuery.isError ? 'job targets' : 'atoms'}.
          </strong>{' '}
          {((targetsQuery.error ?? atomsQuery.error) as Error | null)?.message}, the workspace below
          is incomplete.
        </p>
      )}

      <div className="tailor-workspace">
        <TargetRail activeId={targetId} onSelect={(id) => setSearchParams({ target: id })} />

        {target ? (
          <DocumentPane targetId={target.id} draft={draft} onDraft={onDraft} />
        ) : (
          <div className="card">
            <h2 className="card__title">Live document</h2>
            <EmptyState
              glyph="resume"
              title="No target selected"
              hint="Pick a job target on the left, or paste a new description, and the résumé assembles here."
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="card max-h-[72vh] overflow-y-auto">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="card__title">Content controls</h2>
              <div role="group" aria-label="Selection mode" className="flex gap-1">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className="vt-chip"
                    aria-pressed={draft.mode === m.value}
                    onClick={() => onDraft({ mode: m.value })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-3 text-xs text-faint">
              {draft.mode === 'auto'
                ? 'Scored and packed for you. Pin or exclude to steer it.'
                : 'You choose every bullet and its order.'}
            </p>
            {!target ? (
              <EmptyState
                glyph="filter"
                title="No target selected"
                hint="Selection is scored against a job description, so pick a target first."
              />
            ) : (
              <SelectionPane
                atoms={atoms}
                draft={draft}
                onDraft={onDraft}
                tailorResult={tailorResult}
                scoreById={scoreById}
                tailorPending={tailorRun.isPending}
                onRunAuto={runAuto}
              />
            )}
          </div>
          {target && <PreviewPane targetId={target.id} draft={draft} onDraft={onDraft} />}
        </div>
      </div>
    </div>
  );
}
