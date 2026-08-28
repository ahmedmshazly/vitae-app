import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Reorder } from 'motion/react';
import { Chip, ErrorState, Skeleton, StatusTrace } from '@vitae/ui';
import { api } from '../../lib/api.js';
import type { Draft, ModelResult, ResumeBullet, ResumeEntry, ResumeSection } from './types.js';
import { compileBody } from './types.js';

const CONTACT_KEYS = ['city', 'email', 'phone', 'linkedin', 'github', 'site', 'x'];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

/**
 * Visibility toggle for one part of the page. Filled ring means shown, hollow
 * means hidden, so the state is a shape and not only an opacity. The state
 * rides on the accessible name rather than aria-pressed, because the name
 * already changes with it and a button that says both is read twice over.
 */
function EyeButton({
  hidden,
  onClick,
  label,
}: {
  hidden: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`vt-chip paper__eye${hidden ? ' paper__eye--off' : ''}`}
      title={`${hidden ? 'Show' : 'Hide'} ${label}`}
      aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {hidden ? '○' : '●'}
    </button>
  );
}

/** A page-shaped placeholder, so the pane does not jump when the model lands. */
function PaperSkeleton() {
  return (
    <div className="paper" role="status" aria-live="polite" aria-label="Assembling the document">
      <div className="paper__head">
        <Skeleton width="42%" height={22} />
        <div className="mt-2 flex justify-center">
          <Skeleton width="28%" height={12} />
        </div>
        <div className="paper__contacts mt-3">
          {['a', 'b', 'c'].map((key) => (
            <Skeleton key={key} width={70} height={10} />
          ))}
        </div>
      </div>
      {['summary', 'experience', 'education'].map((key) => (
        <div className="paper__section" key={key}>
          <Skeleton width="34%" height={13} />
          <div className="paper__sectionbody flex flex-col gap-2">
            <Skeleton width="92%" height={9} />
            <Skeleton width="84%" height={9} />
            <Skeleton width="88%" height={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  targetId: string;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
}

/**
 * Interactive HTML paper replica. It deliberately uses the same ResumeModel as
 * LaTeX compilation, so what users hide/order here is exactly what renderers
 * receive. The true PDF remains available from Preview & output.
 *
 * Styling lives in styles/resume-paper.css on the --paper-* ramp: the page is
 * a light surface and the app's dark tokens cannot express it.
 */
export function DocumentPane({ targetId, draft, onDraft }: Props) {
  const [settledDraft, setSettledDraft] = useState(draft);
  useEffect(() => {
    const timer = setTimeout(() => setSettledDraft(draft), 250);
    return () => clearTimeout(timer);
  }, [draft]);

  const body = useMemo(() => compileBody(targetId, settledDraft), [targetId, settledDraft]);
  const modelQuery = useQuery({
    queryKey: ['resume-model', targetId, body],
    queryFn: () => api.post<ModelResult>('/resumes/model', body),
    staleTime: 5_000,
  });

  if (modelQuery.isPending) return <PaperSkeleton />;

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <ErrorState
        title="Couldn't assemble the document"
        detail={
          modelQuery.error instanceof Error
            ? modelQuery.error.message
            : 'The résumé model did not come back.'
        }
        onRetry={() => void modelQuery.refetch()}
        retrying={modelQuery.isFetching}
        retryLabel="Rebuild"
      />
    );
  }

  const { model, pageEstimate, selection } = modelQuery.data;
  const selectedAtomIds = new Set(selection.entries.map((entry) => entry.atomId));
  const sectionsByKey = new Map(model.sections.map((section) => [section.key, section]));
  const availableKeys = ['summary', ...model.sections.map((section) => section.key)];
  const sectionOrder = [
    ...draft.sectionOrder.filter((key) => availableKeys.includes(key)),
    ...availableKeys.filter((key) => !draft.sectionOrder.includes(key)),
  ];

  const setItemOrder = (section: string, ids: string[]) =>
    onDraft({ itemOrder: { ...draft.itemOrder, [section]: ids } });
  const setBulletOrder = (entry: string, ids: string[]) =>
    onDraft({ bulletOrder: { ...draft.bulletOrder, [entry]: ids } });

  const toggleItem = (id: string, hidden: boolean) => {
    if (hidden) {
      onDraft({
        itemsEnabled: [...new Set([...draft.itemsEnabled, id])],
        itemsDisabled: draft.itemsDisabled.filter((value) => value !== id),
      });
    } else {
      onDraft({
        itemsDisabled: [...new Set([...draft.itemsDisabled, id])],
        itemsEnabled: draft.itemsEnabled.filter((value) => value !== id),
      });
    }
  };

  const toggleBullet = (bullet: ResumeBullet) => {
    if (selectedAtomIds.has(bullet.id)) {
      if (draft.mode === 'manual') {
        onDraft({ include: draft.include.filter((id) => id !== bullet.id) });
      } else {
        onDraft({
          blocks: [...new Set([...draft.blocks, bullet.id])],
          pins: draft.pins.filter((id) => id !== bullet.id),
          atomOrder: draft.atomOrder.filter((id) => id !== bullet.id),
        });
      }
      return;
    }
    onDraft({ bulletsDisabled: toggle(draft.bulletsDisabled, bullet.id) });
  };

  const renderEntry = (entry: ResumeEntry, sectionKey: string) => {
    const bulletIds = entry.bullets.map((bullet) => bullet.id);
    return (
      <Reorder.Item key={entry.id} value={entry.id} className="paper__row">
        <div
          data-resume-item={entry.id}
          className={`paper__entry${entry.disabled ? ' paper__entry--off' : ''}`}
        >
          <div className="paper__entryhead">
            <span className="paper__grip" title="Drag entry">
              ⋮⋮
            </span>
            <strong className="paper__role">{entry.role}</strong>
            {entry.dates && <span className="paper__dates">{entry.dates}</span>}
            <EyeButton
              hidden={entry.disabled === true}
              onClick={() => toggleItem(entry.id, entry.disabled === true)}
              label={entry.role}
            />
          </div>
          {(entry.org || entry.location) && (
            <div className="paper__org">
              {[entry.org, entry.location].filter(Boolean).join(' | ')}
            </div>
          )}
          {entry.bullets.length > 0 && (
            <Reorder.Group
              axis="y"
              values={bulletIds}
              onReorder={(ids) => setBulletOrder(entry.id, ids as string[])}
              className="paper__bullets"
            >
              {entry.bullets.map((bullet) => (
                <Reorder.Item key={bullet.id} value={bullet.id} className="paper__row">
                  <div className={`paper__bullet${bullet.disabled ? ' paper__bullet--off' : ''}`}>
                    <span className="paper__mark">•</span>
                    <span>{plain(bullet.text)}</span>
                    <button
                      type="button"
                      className="vt-chip paper__drop"
                      title={bullet.disabled ? 'Show detail' : 'Remove detail from résumé'}
                      // Every bullet's button carried the same name, so a
                      // screen reader heard "Remove detail" a dozen times with
                      // no way to tell which bullet it would remove.
                      aria-label={`${bullet.disabled ? 'Show' : 'Remove'} detail: ${plain(bullet.text).slice(0, 60)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleBullet(bullet);
                      }}
                    >
                      {bullet.disabled ? '↺' : '×'}
                    </button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
          {entry.bullets.length === 0 && sectionKey !== 'education' && (
            <div className="paper__empty">No selected details, choose atoms in the controls.</div>
          )}
        </div>
      </Reorder.Item>
    );
  };

  const renderSection = (section: ResumeSection) => {
    if (section.kind === 'entries') {
      const ids = (section.entries ?? []).map((entry) => entry.id);
      return (
        <Reorder.Group
          axis="y"
          values={ids}
          onReorder={(next) => setItemOrder(section.key, next as string[])}
          className="paper__list"
        >
          {(section.entries ?? []).map((entry) => renderEntry(entry, section.key))}
        </Reorder.Group>
      );
    }
    if (section.kind === 'skillrows') {
      const ids = (section.skillRows ?? []).map((row) => row.id);
      return (
        <Reorder.Group
          axis="y"
          values={ids}
          onReorder={(next) => setItemOrder(section.key, next as string[])}
          className="paper__list"
        >
          {(section.skillRows ?? []).map((row) => (
            <Reorder.Item key={row.id} value={row.id} className="paper__row">
              <div className={`paper__skillrow${row.disabled ? ' paper__skillrow--off' : ''}`}>
                <span className="paper__grip" title="Drag skill group">
                  ⋮
                </span>
                <strong className="paper__skilllabel">{row.label}</strong>
                <div className="paper__skills">
                  {row.skills.map((skill) => (
                    <button
                      type="button"
                      key={skill.id}
                      className={`paper__skill${skill.disabled ? ' paper__skill--off' : ''}`}
                      title={`${skill.disabled ? 'Include' : 'Exclude'} ${skill.name}`}
                      aria-pressed={!skill.disabled}
                      onClick={() =>
                        onDraft({ skillsDisabled: toggle(draft.skillsDisabled, skill.id) })
                      }
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
                <EyeButton
                  hidden={row.disabled === true}
                  onClick={() => toggleItem(row.id, row.disabled === true)}
                  label={row.label}
                />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      );
    }
    const ids = (section.lines ?? []).map((line) => line.id);
    return (
      <Reorder.Group
        axis="y"
        values={ids}
        onReorder={(next) => setItemOrder(section.key, next as string[])}
        className="paper__list"
      >
        {(section.lines ?? []).map((line) => (
          <Reorder.Item key={line.id} value={line.id} className="paper__row">
            <div className={`paper__line${line.disabled ? ' paper__line--off' : ''}`}>
              <span className="paper__grip" title="Drag item">
                ⋮
              </span>
              <span className="paper__linetext">{plain(line.text)}</span>
              <EyeButton
                hidden={line.disabled === true}
                onClick={() => toggleItem(line.id, line.disabled === true)}
                label={line.text}
              />
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="card__title">Live document</h2>
          <p className="m-0 text-xs text-faint">Drag and toggle directly on the paper.</p>
        </div>
        <div className="chips">
          <Chip mono>{selection.entries.length} details</Chip>
          <Chip mono tone={pageEstimate.pages === 1 ? 'accent' : 'default'}>
            {pageEstimate.pages}p est.
          </Chip>
        </div>
      </div>

      {modelQuery.isFetching && (
        <StatusTrace
          className="mb-2"
          tone="live"
          label="Rebuilding the page"
          detail="From your last change"
        />
      )}

      <div data-testid="resume-paper" className="paper">
        <div className="paper__head">
          <div className="paper__name">{model.name}</div>
          <div className="paper__headline">{model.headline}</div>
          {model.tagline && <div className="paper__tagline">{model.tagline}</div>}

          <Reorder.Group
            axis="x"
            values={model.contacts.map((contact) => contact.key)}
            onReorder={(keys) => onDraft({ contactOrder: keys as string[] })}
            className="paper__contacts"
          >
            {model.contacts.map((contact) => (
              <Reorder.Item key={contact.key} value={contact.key} className="paper__row">
                <span
                  className={`paper__contact${contact.disabled ? ' paper__contact--off' : ''}`}
                >
                  <EyeButton
                    hidden={contact.disabled === true}
                    onClick={() =>
                      onDraft({ contactDisabled: toggle(draft.contactDisabled, contact.key) })
                    }
                    label={contact.key}
                  />
                  {contact.value}
                </span>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div className="paper__stubs">
            {CONTACT_KEYS.filter(
              (key) => !model.contacts.some((contact) => contact.key === key),
            ).map((key) => (
              <Link
                key={key}
                className="paper__stub"
                to={model.profileId ? `/network/people/${model.profileId}` : '/network/people'}
                title={`Add ${key} on your profile`}
              >
                + {key}
              </Link>
            ))}
          </div>
        </div>

        <Reorder.Group
          axis="y"
          values={sectionOrder}
          onReorder={(keys) => onDraft({ sectionOrder: keys as string[] })}
          className="paper__list"
        >
          {sectionOrder.map((key) => {
            const isSummary = key === 'summary';
            const section = sectionsByKey.get(key);
            if (!isSummary && !section) return null;
            const hidden = draft.sectionsEnabled[key] === false || section?.disabled === true;
            const title = isSummary ? 'Summary' : section!.title;
            return (
              <Reorder.Item key={key} value={key} className="paper__row">
                <section
                  data-resume-section={key}
                  className={`paper__section${hidden ? ' paper__section--off' : ''}`}
                >
                  <div className="paper__sectionhead">
                    <span className="paper__grip paper__grip--sm" title="Drag section">
                      ⋮⋮
                    </span>
                    <span className="paper__sectiontitle">{title}</span>
                    <EyeButton
                      hidden={hidden}
                      onClick={() =>
                        onDraft({ sectionsEnabled: { ...draft.sectionsEnabled, [key]: hidden } })
                      }
                      label={`${title} section`}
                    />
                  </div>
                  <div className="paper__sectionbody">
                    {isSummary ? (
                      model.summary ? (
                        <div className="paper__summary">{plain(model.summary)}</div>
                      ) : (
                        <div className="paper__hint">Add a summary in the controls.</div>
                      )
                    ) : (
                      renderSection(section!)
                    )}
                  </div>
                </section>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>

      <p className="mt-2 text-xs text-faint">
        This is an editable layout replica. Compile PDF is the final typeset output.
      </p>
    </div>
  );
}
