import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Reorder } from 'motion/react';
import { Chip, Spinner } from '@vitae/ui';
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

function EyeButton({ hidden, onClick, label }: { hidden: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="vt-chip"
      title={`${hidden ? 'Show' : 'Hide'} ${label}`}
      aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{ cursor: 'pointer', opacity: hidden ? 0.55 : 1, padding: '2px 6px' }}
    >
      {hidden ? '○' : '●'}
    </button>
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
 */
/**
 * Ink for the editor's own affordances *inside* the paper, drag handles, empty
 * hints, the "+ site" stubs. The paper is a light surface, so the --ae-* tokens
 * cannot be used here: they are calibrated against the dark canvas and would be
 * invisible on white.
 *
 * Was #8a9098, which is 3.21:1 on #ffffff, below the AA floor, and axe caught
 * it. This is 6.0:1. These are app chrome that happens to sit on the document,
 * not part of the printed résumé, so they answer to the app's standards.
 */
const PAPER_AFFORDANCE = '#5a6472';
const PAPER_AFFORDANCE_BORDER = '#9aa2ad';

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

  if (modelQuery.isPending) {
    return (
      <div className="card" style={{ minHeight: 520, display: 'grid', placeItems: 'center' }}>
        <Spinner />
      </div>
    );
  }
  if (modelQuery.isError || !modelQuery.data) {
    return (
      <div className="card" style={{ minHeight: 320 }}>
        <h2 className="card__title">Document preview unavailable</h2>
        <div className="u-muted">{modelQuery.error instanceof Error ? modelQuery.error.message : 'Could not assemble résumé model.'}</div>
      </div>
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
      <Reorder.Item key={entry.id} value={entry.id} style={{ listStyle: 'none' }}>
        <div
          data-resume-item={entry.id}
          style={{
            position: 'relative',
            marginBottom: 7,
            opacity: entry.disabled ? 0.42 : 1,
            borderLeft: entry.disabled ? '2px dashed #c7ccd1' : '2px solid transparent',
            paddingLeft: 6,
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span title="Drag entry" style={{ cursor: 'grab', color: PAPER_AFFORDANCE, userSelect: 'none' }}>⋮⋮</span>
            <strong style={{ flex: 1, fontSize: 12.5 }}>{entry.role}</strong>
            {entry.dates && <span style={{ fontSize: 10.5, color: '#565656' }}>{entry.dates}</span>}
            <EyeButton hidden={entry.disabled === true} onClick={() => toggleItem(entry.id, entry.disabled === true)} label={entry.role} />
          </div>
          {(entry.org || entry.location) && (
            <div style={{ marginLeft: 19, fontSize: 10.5, fontStyle: 'italic', color: '#565656' }}>
              {[entry.org, entry.location].filter(Boolean).join(' | ')}
            </div>
          )}
          {entry.bullets.length > 0 && (
            <Reorder.Group
              axis="y"
              values={bulletIds}
              onReorder={(ids) => setBulletOrder(entry.id, ids as string[])}
              style={{ listStyle: 'none', padding: 0, margin: '3px 0 0 22px' }}
            >
              {entry.bullets.map((bullet) => (
                <Reorder.Item key={bullet.id} value={bullet.id} style={{ listStyle: 'none' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '10px 1fr auto',
                      gap: 5,
                      alignItems: 'start',
                      opacity: bullet.disabled ? 0.4 : 1,
                      // Document type, not app chrome: this is the résumé's own
                      // bullet size and matches the dates and subtitles around
                      // it. The 11px app floor governs the editor's affordances
                      // on the paper, not the paper's contents.
                      fontSize: 10.5,
                      lineHeight: 1.28,
                      cursor: 'grab',
                    }}
                  >
                    <span style={{ color: '#1f3a5f' }}>•</span>
                    <span>{plain(bullet.text)}</span>
                    <button
                      type="button"
                      className="vt-chip"
                      title={bullet.disabled ? 'Show detail' : 'Remove detail from résumé'}
                      // Every bullet's button carried the same name, so a
                      // screen reader heard "Remove detail" a dozen times with
                      // no way to tell which bullet it would remove.
                      aria-label={`${bullet.disabled ? 'Show' : 'Remove'} detail: ${plain(bullet.text).slice(0, 60)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleBullet(bullet);
                      }}
                      style={{ cursor: 'pointer', padding: '0 4px', fontSize: 11 }}
                    >
                      {bullet.disabled ? '↺' : '×'}
                    </button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
          {entry.bullets.length === 0 && sectionKey !== 'education' && (
            <div style={{ marginLeft: 19, fontSize: 11, color: PAPER_AFFORDANCE }}>No selected details, choose atoms in the controls.</div>
          )}
        </div>
      </Reorder.Item>
    );
  };

  const renderSection = (section: ResumeSection) => {
    if (section.kind === 'entries') {
      const ids = (section.entries ?? []).map((entry) => entry.id);
      return (
        <Reorder.Group axis="y" values={ids} onReorder={(next) => setItemOrder(section.key, next as string[])} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(section.entries ?? []).map((entry) => renderEntry(entry, section.key))}
        </Reorder.Group>
      );
    }
    if (section.kind === 'skillrows') {
      const ids = (section.skillRows ?? []).map((row) => row.id);
      return (
        <Reorder.Group axis="y" values={ids} onReorder={(next) => setItemOrder(section.key, next as string[])} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(section.skillRows ?? []).map((row) => (
            <Reorder.Item key={row.id} value={row.id} style={{ listStyle: 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '16px 105px 1fr auto', gap: 4, marginBottom: 3, opacity: row.disabled ? 0.42 : 1, alignItems: 'start' }}>
                <span title="Drag skill group" style={{ cursor: 'grab', color: PAPER_AFFORDANCE }}>⋮</span>
                <strong style={{ fontSize: 10.5 }}>{row.label}</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 4px' }}>
                  {row.skills.map((skill) => (
                    <button
                      type="button"
                      key={skill.id}
                      title={`${skill.disabled ? 'Include' : 'Exclude'} ${skill.name}`}
                      onClick={() => onDraft({ skillsDisabled: toggle(draft.skillsDisabled, skill.id) })}
                      style={{
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        color: skill.disabled ? '#9ba0a6' : '#1e1e1e',
                        textDecoration: skill.disabled ? 'line-through' : 'none',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontSize: 11,
                      }}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
                <EyeButton hidden={row.disabled === true} onClick={() => toggleItem(row.id, row.disabled === true)} label={row.label} />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      );
    }
    const ids = (section.lines ?? []).map((line) => line.id);
    return (
      <Reorder.Group axis="y" values={ids} onReorder={(next) => setItemOrder(section.key, next as string[])} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {(section.lines ?? []).map((line) => (
          <Reorder.Item key={line.id} value={line.id} style={{ listStyle: 'none' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: line.disabled ? 0.42 : 1, fontSize: 10.5, marginBottom: 2 }}>
              <span title="Drag item" style={{ cursor: 'grab', color: PAPER_AFFORDANCE }}>⋮</span>
              <span style={{ flex: 1 }}>{plain(line.text)}</span>
              <EyeButton hidden={line.disabled === true} onClick={() => toggleItem(line.id, line.disabled === true)} label={line.text} />
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    );
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="card__title">Live document</h2>
          <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)' }}>Drag and toggle directly on the paper.</div>
        </div>
        <div className="chips">
          <Chip mono>{selection.entries.length} details</Chip>
          <Chip mono tone={pageEstimate.pages === 1 ? 'accent' : 'default'}>{pageEstimate.pages}p est.</Chip>
          {modelQuery.isFetching && <Chip mono>updating…</Chip>}
        </div>
      </div>

      <div
        data-testid="resume-paper"
        style={{
          width: '100%',
          minHeight: 760,
          background: '#fff',
          color: '#1e1e1e',
          boxShadow: '0 8px 30px rgba(12, 20, 30, .16)',
          border: '1px solid #d9dde1',
          padding: '28px 32px',
          fontFamily: 'Charter, Georgia, serif',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ color: '#1f3a5f', fontFamily: 'Arial, sans-serif', fontSize: 27, fontWeight: 800 }}>{model.name}</div>
          <div style={{ color: '#565656', fontFamily: 'Arial, sans-serif', fontSize: 14 }}>{model.headline}</div>
          {model.tagline && <div style={{ color: '#565656', fontSize: 10.5, marginTop: 3 }}>{model.tagline}</div>}

          <Reorder.Group
            axis="x"
            values={model.contacts.map((contact) => contact.key)}
            onReorder={(keys) => onDraft({ contactOrder: keys as string[] })}
            style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}
          >
            {model.contacts.map((contact) => (
              <Reorder.Item key={contact.key} value={contact.key} style={{ listStyle: 'none' }}>
                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', opacity: contact.disabled ? 0.4 : 1, fontSize: 11, cursor: 'grab' }}>
                  <EyeButton
                    hidden={contact.disabled === true}
                    onClick={() => onDraft({ contactDisabled: toggle(draft.contactDisabled, contact.key) })}
                    label={contact.key}
                  />
                  {contact.value}
                </span>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {CONTACT_KEYS.filter((key) => !model.contacts.some((contact) => contact.key === key)).map((key) => (
              <Link
                key={key}
                to={model.profileId ? `/people/${model.profileId}` : '/people'}
                title={`Add ${key} on your profile`}
                style={{ color: PAPER_AFFORDANCE, border: `1px dashed ${PAPER_AFFORDANCE_BORDER}`, borderRadius: 10, padding: '1px 5px', fontSize: 11 }}
              >
                + {key}
              </Link>
            ))}
          </div>
        </div>

        <Reorder.Group axis="y" values={sectionOrder} onReorder={(keys) => onDraft({ sectionOrder: keys as string[] })} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sectionOrder.map((key) => {
            const isSummary = key === 'summary';
            const section = sectionsByKey.get(key);
            if (!isSummary && !section) return null;
            const hidden = draft.sectionsEnabled[key] === false || section?.disabled === true;
            const title = isSummary ? 'Summary' : section!.title;
            return (
              <Reorder.Item key={key} value={key} style={{ listStyle: 'none' }}>
                <section data-resume-section={key} style={{ opacity: hidden ? 0.38 : 1, marginTop: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', alignItems: 'center', gap: 4, color: '#1f3a5f', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 14 }}>
                    <span title="Drag section" style={{ cursor: 'grab', color: PAPER_AFFORDANCE, fontSize: 11 }}>⋮⋮</span>
                    <span style={{ borderBottom: '1px solid #c7ccd1', paddingBottom: 1 }}>{title}</span>
                    <EyeButton
                      hidden={hidden}
                      onClick={() => onDraft({ sectionsEnabled: { ...draft.sectionsEnabled, [key]: hidden } })}
                      label={`${title} section`}
                    />
                  </div>
                  <div style={{ marginTop: 4, marginLeft: 20 }}>
                    {isSummary ? (
                      model.summary ? <div style={{ fontSize: 10.5, lineHeight: 1.32 }}>{plain(model.summary)}</div> : <div style={{ color: PAPER_AFFORDANCE, fontSize: 11 }}>Add a summary in the controls.</div>
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

      <div className="u-faint" style={{ fontSize: 'var(--ae-text-xs)', marginTop: 8 }}>
        This is an editable layout replica. Compile PDF is the final typeset output.
      </div>
    </div>
  );
}
