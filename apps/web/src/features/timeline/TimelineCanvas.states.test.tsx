/**
 * The chronograph's keyboard story. Every mark was a button you could reach
 * and then do nothing with: Enter opened whatever the window handler thought
 * was selected, and a season could only be brushed by dragging a mouse.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GraphPalette } from '../../lib/graph-palette.js';
import { renderWithApp } from '../../test/render.js';
import { TimelineCanvas } from './TimelineCanvas.js';
import { DEFAULT_TIMELINE_PREFS } from './displayPrefs.js';
import type { BrushRange, TimelineItem, TimelineLane } from './types.js';

const palette: GraphPalette = {
  bg: '#000000',
  border: '#111111',
  borderStrong: '#222222',
  muted: '#888888',
  faint: '#666666',
  fg: '#ffffff',
  accent: '#eeeeee',
  accentSoft: '#cccccc',
  plate: '#000000',
  dim: '#333333',
  fontSans: 'sans-serif',
  fontMono: 'monospace',
  slots: Array(8).fill('#00ff00') as string[],
};

const role: TimelineItem = {
  id: 'r1',
  type: 'role',
  title: 'Senior ML Engineer',
  subtitle: 'Nile Robotics',
  start: '2021-03-01',
  end: '2022-06-01',
  current: false,
  kind: 'span',
};

const talk: TimelineItem = {
  id: 'm1',
  type: 'talk',
  title: 'DevFest Cairo',
  subtitle: null,
  start: '2022-11-02',
  end: null,
  current: false,
  kind: 'moment',
};

const lanes: TimelineLane[] = [
  { name: 'Roles', items: [role] },
  { name: 'Events', items: [talk] },
];

function canvas(over: Partial<Parameters<typeof TimelineCanvas>[0]> = {}) {
  const scrollRef = { current: null } as unknown as RefObject<HTMLDivElement>;
  return renderWithApp(
    <TimelineCanvas
      lanes={lanes}
      years={[2021, 2022, 2023]}
      zoom="year"
      nowIso="2023-01-01"
      palette={palette}
      prefs={DEFAULT_TIMELINE_PREFS}
      brush={null}
      brushDraft={null}
      selectedId={null}
      reducedMotion={false}
      onSelect={() => {}}
      onOpen={() => {}}
      onBrushDraft={() => {}}
      onBrushCommit={() => {}}
      scrollRef={scrollRef}
      {...over}
    />,
  );
}

const mark = (item: TimelineItem) =>
  screen.getByRole('button', { name: new RegExp(item.title) });

describe('TimelineCanvas keyboard', () => {
  // The window listener in TimelineView opened whatever was selected last, so
  // pressing Enter on a bar you had tabbed to opened a different record.
  it('selects the mark under focus before it opens anything', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    canvas({ onSelect, onOpen });

    mark(role).focus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(role);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the mark that is already selected', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    canvas({ selectedId: role.id, onOpen });

    mark(role).focus();
    await user.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledWith(role);
  });

  // Brushing a season was pointer-only, which put the review, its digest and
  // its Markdown export out of reach without a mouse.
  it('brushes a season from a focused mark', async () => {
    const user = userEvent.setup();
    const onBrushCommit = vi.fn();
    canvas({ onBrushCommit });

    mark(role).focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');

    expect(onBrushCommit).toHaveBeenCalledTimes(1);
    const range = onBrushCommit.mock.calls[0]![0] as BrushRange;
    expect(range.from).toBe(role.start);
    expect(range.to > range.from).toBe(true);
    expect(range.to < '2021-05-01').toBe(true);
  });

  it('walks the far end of a brush it already anchored', async () => {
    const user = userEvent.setup();
    const onBrushCommit = vi.fn();
    canvas({ brush: { from: role.start, to: '2021-09-01' }, onBrushCommit });

    mark(role).focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');

    const range = onBrushCommit.mock.calls[0]![0] as BrushRange;
    expect(range.to > '2021-09-01').toBe(true);
  });

  // A shift-left that would run past the anchor stops at one month, rather
  // than committing a range that ends before it starts.
  it('never walks the far end back past its anchor', async () => {
    const user = userEvent.setup();
    const onBrushCommit = vi.fn();
    canvas({ onBrushCommit });

    mark(role).focus();
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');

    const range = onBrushCommit.mock.calls[0]![0] as BrushRange;
    expect(range.to > range.from).toBe(true);
  });
});

describe('TimelineCanvas structure', () => {
  // The lane name floated beside the track with nothing tying it to the marks
  // in it, so the axis the whole chronograph organises by never reached a
  // screen reader.
  it('puts each mark inside the lane it belongs to', () => {
    canvas();

    const roles = screen.getByRole('group', { name: 'Roles' });
    expect(within(roles).getByRole('button', { name: /Senior ML Engineer/ })).toBeInTheDocument();
    expect(within(roles).queryByRole('button', { name: /DevFest Cairo/ })).toBeNull();

    const events = screen.getByRole('group', { name: 'Events' });
    expect(within(events).getByRole('button', { name: /DevFest Cairo/ })).toBeInTheDocument();
  });

  // Selection shared one CSS rule with hover, so it was a brightness step and
  // nothing else. The state has to be readable without seeing the bar.
  it('says which mark is selected rather than only brightening it', () => {
    canvas({ selectedId: role.id });

    expect(mark(role)).toHaveAttribute('aria-pressed', 'true');
    expect(mark(talk)).toHaveAttribute('aria-pressed', 'false');
  });

  it('names a mark by when it happened, not only what it was', () => {
    canvas();

    expect(
      screen.getByRole('button', {
        name: 'Senior ML Engineer · Nile Robotics · 2021-03-01 to 2022-06-01',
      }),
    ).toBeInTheDocument();
  });
});
