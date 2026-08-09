import { Link } from 'react-router-dom';
import { Mono } from '@vitae/ui';
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
      l.items
        .filter((i) => showMoments || i.kind === 'span')
        .map((i) => ({ ...i, lane: l.name })),
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
      <div className="empty" style={{ padding: 48 }}>
        <div className="empty__title">Nothing dated yet</div>
        <div>Add start dates to roles, projects, education, events, or trips.</div>
      </div>
    );
  }

  return (
    <div className="tl__list" role="list">
      {years.map((y) => (
        <section key={y} className="tl__listyear">
          <h2 className="tl__listyearhead">{y}</h2>
          <ul className="tl__listul">
            {(byYear.get(y) ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`tl__listrow${selectedId === item.id ? ' tl__listrow--on' : ''}`}
                  onClick={() => onSelect(item)}
                >
                  <Mono className="u-faint text-xs" style={{ width: 88, flex: 'none' }}>
                    {item.start.slice(5)}
                    {item.end ? `-${item.end.slice(5)}` : item.current ? '-now' : ''}
                  </Mono>
                  <span className="tl__listrowtitle">{item.title}</span>
                  <Mono className="u-faint text-xs">
                    {item.lane}
                  </Mono>
                  <Link
                    className="tl__listopen"
                    to={entityHref(item.type, item.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    open
                  </Link>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
