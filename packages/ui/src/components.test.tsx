import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  ClosenessDots,
  DotGrid,
  EntityGlyph,
  FactorBar,
  FilterGroup,
  StrengthBar,
} from './components.js';

describe('Button', () => {
  it('renders the base vt-btn class with no modifier for default/md', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('vt-btn');
    expect(btn.className).not.toMatch(/vt-btn--/);
  });

  it.each([
    ['primary', 'vt-btn--primary'],
    ['ghost', 'vt-btn--ghost'],
    ['danger', 'vt-btn--danger'],
  ] as const)('applies %s variant class', (variant, cls) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('vt-btn', cls);
  });

  it.each([
    ['sm', 'vt-btn--sm'],
    ['lg', 'vt-btn--lg'],
  ] as const)('applies %s size class', (size, cls) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('vt-btn', cls);
  });

  it('merges a caller className alongside the variant classes (ConfirmDialog danger-fill)', () => {
    render(
      <Button variant="danger" className="vt-btn--danger-fill">
        Delete
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toHaveClass('vt-btn', 'vt-btn--danger', 'vt-btn--danger-fill');
  });

  it('fires onClick and respects disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button', { name: 'Click' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    const onClickDisabled = vi.fn();
    render(
      <Button onClick={onClickDisabled} disabled>
        Blocked
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Blocked' }));
    expect(onClickDisabled).not.toHaveBeenCalled();
  });

  it('renders a glyph icon when given one', () => {
    render(<Button glyph="capture">Capture</Button>);
    const btn = screen.getByRole('button', { name: 'Capture' });
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('forwards the ref to the underlying <button>', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Anchor</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Anchor');
  });
});

describe('DotGrid', () => {
  it('stays out of the accessibility tree without a label', () => {
    const { container } = render(<DotGrid days={[true, false, true]} />);
    expect(container.querySelector('.vt-dotgrid')).toHaveAttribute('aria-hidden', 'true');
  });

  it('summarises the streak in words when labelled: 30 silent dots say nothing', () => {
    render(<DotGrid days={[true, false, true, true]} label="Deep work" />);
    expect(screen.getByRole('img', { name: 'Deep work: 3 of the last 4 days' })).toBeInTheDocument();
  });

  it('draws an unchecked slot rather than leaving a hole', () => {
    const { container } = render(<DotGrid days={[false]} label="Writing" />);
    const dot = container.querySelector<HTMLElement>('.vt-dotgrid__dot')!;
    expect(dot.style.background).toBe('var(--line)');
  });
});

describe('EntityGlyph', () => {
  it('titles the tile with the type by default', () => {
    const { container } = render(<EntityGlyph type="person" />);
    expect(container.querySelector('.vt-glyph')).toHaveAttribute('title', 'person');
  });

  it('takes an explicit glyph for rows that are not node types', () => {
    // A reminder has no node type; without the override glyphForType falls back
    // to the generic dot and the title claims the row is a "reminder" record.
    const { container } = render(<EntityGlyph type="reminder" glyph="bell" title="Reminder" />);
    const tile = container.querySelector('.vt-glyph')!;
    expect(tile).toHaveAttribute('title', 'Reminder');
    expect(tile.querySelector('svg')).toBeInTheDocument();
  });
});

describe('FilterGroup', () => {
  const options = [
    { key: 'all', label: 'All' },
    { key: 'decaying', label: 'Decaying' },
  ] as const;

  it('says which filter is applied, rather than only colouring it', () => {
    render(<FilterGroup label="Filter people" options={options} value="decaying" onChange={vi.fn()} />);
    // These were <button class="vt-chip"> with an inline border colour: the
    // active one was distinguishable by sight and by nothing else.
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Decaying' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the set so the buttons are not six unexplained words', () => {
    render(<FilterGroup label="Filter people" options={options} value="all" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Filter people' })).toBeInTheDocument();
  });

  it('reports the key, not the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterGroup label="Filter people" options={options} value="all" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Decaying' }));
    expect(onChange).toHaveBeenCalledWith('decaying');
  });
});

describe('StrengthBar', () => {
  it('always prints the number beside the bar', () => {
    render(<StrengthBar value={0.42} label="tie strength with Sarah" />);
    expect(screen.getByText('0.42')).toBeInTheDocument();
  });

  it('varies one hue by opacity rather than banding into three colours', () => {
    const { container: weak } = render(<StrengthBar value={0.1} label="a" />);
    const { container: strong } = render(<StrengthBar value={0.9} label="b" />);
    const fill = (c: HTMLElement) => c.querySelector<HTMLElement>('.vt-strength__fill')!;
    // Magnitude is a sequential scale: same hue, more of it. Three bands read
    // as three categories.
    expect(fill(weak).style.background).toBe(fill(strong).style.background);
    expect(Number(fill(weak).style.opacity)).toBeLessThan(Number(fill(strong).style.opacity));
    expect(fill(strong).style.width).toBe('90%');
  });

  it('clamps out-of-range values instead of overflowing the track', () => {
    const { container } = render(<StrengthBar value={1.8} label="a" />);
    expect(container.querySelector<HTMLElement>('.vt-strength__fill')!.style.width).toBe('100%');
    expect(screen.getByText('1.00')).toBeInTheDocument();
  });

  it('carries what the number means for anyone not seeing the column header', () => {
    render(<StrengthBar value={0.5} label="tie strength with Sarah" />);
    expect(screen.getByText('tie strength with Sarah')).toHaveClass('u-visually-hidden');
  });
});

describe('FactorBar', () => {
  const parts = [
    { label: 'topics', value: 1.6 },
    { label: 'strength', value: 0.22 },
    { label: 'network proximity', value: 0.02 },
  ];

  it('names every contributing factor and its value, so the bar is never the only carrier', () => {
    render(<FactorBar parts={parts} scale={1.84} label="Score 1.84" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Score 1.84: topics 1.60, strength 0.22, network proximity 0.02',
    );
  });

  // One ink per segment (opacity for magnitude). A categorical hue per factor
  // would fight the identity: tokens.css says semantic colours are never a series.
  it('uses one ink for every segment, varying only opacity', () => {
    const { container } = render(<FactorBar parts={parts} scale={1.84} label="Score 1.84" />);
    const segs = [...container.querySelectorAll<HTMLElement>('.vt-factorbar__seg')];
    expect(segs).toHaveLength(3);
    expect(new Set(segs.map((s) => s.style.background)).size).toBe(1);
    expect(Number(segs[0]!.style.opacity)).toBeGreaterThan(Number(segs[2]!.style.opacity));
  });

  it('draws widths against the given scale so bars compare between rows', () => {
    const { container } = render(<FactorBar parts={[{ label: 'a', value: 0.5 }]} scale={2} label="Score 0.50" />);
    expect(container.querySelector<HTMLElement>('.vt-factorbar__seg')!.style.width).toBe('25%');
  });

  it('orders segments by contribution regardless of the order handed in', () => {
    const { container } = render(
      <FactorBar parts={[{ label: 'small', value: 0.1 }, { label: 'big', value: 0.9 }]} scale={1} label="Score 1.00" />,
    );
    const segs = [...container.querySelectorAll<HTMLElement>('.vt-factorbar__seg')];
    expect(segs[0]!.style.width).toBe('90%');
  });

  it('drops non-contributing factors rather than drawing zero-width slivers', () => {
    const { container } = render(
      <FactorBar parts={[{ label: 'a', value: 1 }, { label: 'b', value: 0 }]} scale={1} label="Score 1.00" />,
    );
    expect(container.querySelectorAll('.vt-factorbar__seg')).toHaveLength(1);
  });

  it('says so rather than rendering an unexplained empty track', () => {
    render(<FactorBar parts={[]} scale={1} label="Score 0.00" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Score 0.00: no contributing factors');
  });

  it('never overflows the track when a part exceeds the scale', () => {
    const { container } = render(<FactorBar parts={[{ label: 'a', value: 5 }]} scale={1} label="Score 5.00" />);
    expect(container.querySelector<HTMLElement>('.vt-factorbar__seg')!.style.width).toBe('100%');
  });
});

describe('ClosenessDots', () => {
  it('states the value in text, not only in a title on a span', () => {
    render(<ClosenessDots value={3} />);
    expect(screen.getByText('Closeness 3 of 5')).toBeInTheDocument();
  });

  it('says so when closeness was never set', () => {
    render(<ClosenessDots value={null} />);
    expect(screen.getByText('Closeness not set')).toBeInTheDocument();
  });

  it('marks a set dot with a class, so fill and not only hue separates them', () => {
    const { container } = render(<ClosenessDots value={2} max={4} />);
    expect(container.querySelectorAll('.vt-closeness__dot')).toHaveLength(4);
    expect(container.querySelectorAll('.vt-closeness__dot--on')).toHaveLength(2);
  });

  it('keeps the dots out of the accessibility tree', () => {
    const { container } = render(<ClosenessDots value={1} />);
    expect(container.querySelector('.vt-closeness__dots')).toHaveAttribute('aria-hidden', 'true');
  });

  it('prints the value beside the dots when asked to', () => {
    const { container } = render(<ClosenessDots value={4} showValue />);
    expect(container.querySelector('.vt-closeness__value')).toHaveTextContent('Closeness 4 of 5');
  });
});
