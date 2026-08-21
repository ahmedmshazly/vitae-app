import { Link } from 'react-router-dom';
import { EmptyState, Mono } from '@vitae/ui';
import { entityHref } from '../../lib/entity-href.js';
import type { TimelineItem, TimelineLane } from './types.js';

export interface TimelineListProps {
  lanes: TimelineLane[];
  activeLanes: string[];
  showMoments: boolean;
  selectedId: string | null;
  onSelect: (item: TimelineItem) => void;
}

export function TimelineList({
  lanes,
  activeLanes,
  showMoments,
  selectedId,
  onSelect,
}: TimelineListProps) {
  const items = lanes
    .filter((l) => activeLanes.includes(l.name))
    .flatMap((l) =>
      l.items.filter((i) => showMoments || i.kind === 'span').map((i) => ({ ...i, lane: l.name })),
    )
    .sort((a, b) => b.start.localeCompare(a.start) || a.title.localeCompare(b.title));

  const byYear = new Map<string, typeof items>();
  for (const item of items) {
    const y = item.start.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(item);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  if (items.length === 0) {
    return (
      <EmptyState
        className="explore-instrument__empty"
        glyph="timeline"
        title="Nothing dated in these lanes"
        hint="Turn on another evidence lane, or add dates to roles, projects, education, events, or trips."
      />
    );
  }

  return (
    <div className="tl__list" role="list">
      {years.map((y) => (
        <section key={y} className="tl__listyear">
          <h2 className="tl__listyearhead">{y}</h2>
          <ul className="tl__listul">
            {(byYear.get(y) ?? []).map((item) => (
              <li
                key={item.id}
                className={`tl__listrow${selectedId === item.id ? ' tl__listrow--on' : ''}`}
              >
                <button
                  type="button"
                  className="tl__listselect"
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelect(item)}
                >
                  <Mono className="u-faint text-xs" style={{ width: 88, flex: 'none' }}>
                    {item.start.slice(5)}
                    {item.end ? `-${item.end.slice(5)}` : item.current ? '-now' : ''}
                  </Mono>
                  <span className="tl__listrowcopy">
                    <span className="tl__listrowtitle">{item.title}</span>
                    {item.subtitle && <span className="tl__listrowsub">{item.subtitle}</span>}
                  </span>
                  <Mono className="u-faint text-xs">{item.lane}</Mono>
                </button>
                <Link className="tl__listopen" to={entityHref(item.type, item.id)}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
