import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Banner,
  Card,
  ChipGroup,
  Disclosure,
  Inline,
  Row,
  Spread,
  Stack,
  Tabs,
} from './layout.js';

// Comments are stripped once, here. A comment is not a rule, and leaving them
// in makes every selector match start at the comment above it and every
// assertion below satisfiable by prose.
const LAYOUT_CSS = readFileSync(join(process.cwd(), 'src/styles/layout.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Flat (selector, body) pairs. The regex refuses braces inside either half, so
 * an at-rule wrapper never matches as a selector and the nested rule inside it
 * is what comes back, which is exactly what these assertions want.
 */
function cssRules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

describe('Row', () => {
  it('keeps actions and leading controls outside the click target', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(
      <Row
        main={(p) => <a href="/people/1" {...p} />}
        leading={<input type="checkbox" aria-label="Select Lina Farouk" />}
        title="Lina Farouk"
        subtitle="Staff engineer at Meridian"
        meta="12d quiet"
        actions={
          <button type="button" onClick={onLog}>
            Log
          </button>
        }
      />,
    );

    const link = screen.getByRole('link');
    // The whole row used to be one link, so its accessible name was the glyph,
    // the title, the subtitle, every chip, the strength bar and the date read
    // out as a single string, with a button nested inside it.
    expect(link).toHaveTextContent('Lina Farouk');
    expect(link).toHaveTextContent('Staff engineer at Meridian');
    expect(within(link).queryByRole('button')).toBeNull();
    expect(within(link).queryByRole('checkbox')).toBeNull();
    expect(link).not.toContainElement(screen.getByRole('button', { name: 'Log' }));
    expect(link).not.toHaveTextContent('12d quiet');

    await user.click(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('renders a plain main region when no click target is asked for', () => {
    const { container } = render(<Row title="Read the brand book" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('.vt-row__main')).toHaveTextContent('Read the brand book');
  });

  it('omits the main region entirely when the row is only children', () => {
    // An empty flex:1 region would push a children-only row's content right.
    const { container } = render(
      <Row>
        <span>custom</span>
      </Row>,
    );
    expect(container.querySelector('.vt-row__main')).toBeNull();
  });

  it('gets hover tone only when interactive', () => {
    const { container: plain } = render(<Row title="a" />);
    expect(plain.firstChild).not.toHaveClass('vt-row--interactive');
    const { container: live } = render(<Row interactive title="b" />);
    expect(live.firstChild).toHaveClass('vt-row', 'vt-row--interactive');
  });

  it('takes tone on hover and never travel', () => {
    // The other half of the claim, which lives in CSS: jsdom evaluates no
    // stylesheet, so the rule text is the only place this is observable.
    const rowHover = cssRules(LAYOUT_CSS).filter(
      (r) => r.selector.includes('.vt-row') && r.selector.includes(':hover'),
    );
    expect(rowHover.length).toBeGreaterThan(0);
    for (const rule of rowHover) {
      expect(rule.body).not.toMatch(/transform\s*:/);
      expect(rule.body).not.toMatch(/(margin|left|top|inset|translate)\s*:/);
    }
    const tone = rowHover.find((r) => r.selector.includes('.vt-row--interactive'));
    expect(tone?.body).toMatch(/background:\s*var\(--ae-surface-raised\)/);
  });

  it('reports being the current row to assistive tech, and marks it with a glyph', () => {
    const { container } = render(<Row selected title="Lina Farouk" />);
    const row = container.firstChild as HTMLElement;
    // A data attribute has no accessibility semantics, so it can never be what
    // carries the state. aria-current is the honest meaning here: this is the
    // row whose detail is showing. It is also why there is no visually hidden
    // state word inside the row: on a selectable role that word would be
    // concatenated into the row's accessible name.
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row.querySelector('.vt-row__flag svg')).toBeInTheDocument();
  });

  it('says nothing about selection when the row is not selected', () => {
    const { container } = render(<Row title="Lina Farouk" />);
    const row = container.firstChild as HTMLElement;
    expect(row).not.toHaveAttribute('aria-current');
    expect(row.querySelector('.vt-row__flag')).toBeNull();
  });

  it('uses aria-selected when the row plays a role in a selectable collection', () => {
    render(
      <ul role="listbox" aria-label="People">
        <Row as="li" role="option" selected title="Lina Farouk" />
        <Row as="li" role="option" title="Sam Okonkwo" />
      </ul>,
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    // Stated on the unselected row too: "not selected" is information.
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
    expect(options[0]).not.toHaveAttribute('aria-current');
  });

  it('keeps a selected row named by its content, not by its state', () => {
    render(
      <ul role="listbox" aria-label="People">
        <Row as="li" role="option" selected title="Lina Farouk" />
      </ul>,
    );
    // option is a name-from-content role, so any text inside the row lands in
    // its accessible name. A visually hidden state word here reads out as
    // "SelectedLina Farouk"; the state belongs in aria-selected instead.
    expect(screen.getByRole('option', { name: 'Lina Farouk' })).toBeInTheDocument();
  });

  it('marks a selected row with a glyph, so the ground colour is not the only cue', () => {
    const { container } = render(<Row selected title="Lina Farouk" />);
    expect(container.querySelector('.vt-row__flag svg')).not.toBeNull();
    expect(render(<Row title="Sam Okonkwo" />).container.querySelector('.vt-row__flag')).toBeNull();
  });

  it('keeps data-selected as a styling hook alongside the real semantics', () => {
    const { container } = render(<Row selected title="a" />);
    expect(container.firstChild).toHaveAttribute('data-selected', 'true');
    expect(container.firstChild).toHaveClass('vt-row--selected');
  });

  it('renders as an li when the row sits in a list', () => {
    render(
      <ul>
        <Row as="li" title="Only item" />
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveClass('vt-row');
  });

  it('spreads rest props and forwards its ref', () => {
    const ref = createRef<HTMLElement>();
    render(<Row ref={ref} title="a" data-testid="person-row" aria-label="Lina" />);
    const row = screen.getByTestId('person-row');
    expect(row).toHaveAttribute('aria-label', 'Lina');
    expect(ref.current).toBe(row);
  });

  it('merges a caller className alongside its own', () => {
    const { container } = render(<Row title="a" className="mb-4" />);
    expect(container.firstChild).toHaveClass('vt-row', 'mb-4');
  });
});

describe('Card', () => {
  it('takes interactive affordances only when asked', () => {
    const { container: panel } = render(<Card>Static panel</Card>);
    expect(panel.firstChild).toHaveClass('vt-card');
    // .card:hover fired on every panel in the app, so a static box lit up
    // under the cursor and reported nothing that could be acted on.
    expect(panel.firstChild).not.toHaveClass('vt-card--interactive');

    const { container: live } = render(<Card interactive>Opens a record</Card>);
    expect(live.firstChild).toHaveClass('vt-card', 'vt-card--interactive');
  });

  it('keeps interactive presentational, granting no role and no tab stop', () => {
    // The flag buys hover tone and nothing else, which is the whole contract:
    // a card that granted tone but no role, no tabindex and no key handling
    // while looking clickable would be a mouse-only control.
    const { container } = render(<Card interactive>Opens a record</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.tagName).toBe('DIV');
    expect(card).not.toHaveAttribute('role');
    expect(card).not.toHaveAttribute('tabindex');
    expect(card).not.toHaveAttribute('href');
    // And the stylesheet carries no anchor rule promising a Card that renders
    // as a link, because there is no `as` prop that could ever produce one.
    expect(LAYOUT_CSS).not.toMatch(/(^|[\s,])a\.vt-card\b/m);
  });

  it('renders a head only when there is a title or an action', () => {
    const { container: bare } = render(<Card>body</Card>);
    expect(bare.querySelector('.vt-card__head')).toBeNull();

    const { container: titled } = render(
      <Card title="Pipeline" actions={<button type="button">Add</button>}>
        body
      </Card>,
    );
    expect(titled.querySelector('.vt-card__title')).toHaveTextContent('Pipeline');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('spreads rest props and forwards its ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Card ref={ref} role="group" aria-label="Résumé" data-testid="card">
        body
      </Card>,
    );
    expect(screen.getByRole('group', { name: 'Résumé' })).toBe(ref.current);
    expect(screen.getByTestId('card')).toBe(ref.current);
  });
});

describe('Stack, Inline, Spread, ChipGroup', () => {
  it('maps the gap prop onto the spacing scale', () => {
    const { container: stack } = render(<Stack gap={5}>x</Stack>);
    expect(stack.firstChild).toHaveClass('vt-stack', 'vt-stack--gap-5');
    const { container: inline } = render(<Inline gap={1}>x</Inline>);
    expect(inline.firstChild).toHaveClass('vt-inline', 'vt-inline--gap-1');
    const { container: spread } = render(<Spread gap={8}>x</Spread>);
    expect(spread.firstChild).toHaveClass('vt-spread', 'vt-spread--gap-8');
    const { container: chips } = render(<ChipGroup gap={2}>x</ChipGroup>);
    expect(chips.firstChild).toHaveClass('vt-chipgroup', 'vt-chipgroup--gap-2');
  });

  it('carries the defaults the app-level classes used', () => {
    const { container: stack } = render(<Stack>x</Stack>);
    expect(stack.firstChild).toHaveClass('vt-stack--gap-3');
    const { container: inline } = render(<Inline>x</Inline>);
    expect(inline.firstChild).toHaveClass('vt-inline--gap-2');
    const { container: spread } = render(<Spread>x</Spread>);
    expect(spread.firstChild).toHaveClass('vt-spread--gap-2');
  });

  it('applies align and wrap modifiers', () => {
    const { container } = render(
      <Inline align="baseline" wrap>
        x
      </Inline>,
    );
    expect(container.firstChild).toHaveClass('vt-inline--align-baseline', 'vt-inline--wrap');
    const { container: stack } = render(<Stack align="start">x</Stack>);
    expect(stack.firstChild).toHaveClass('vt-stack--align-start');
  });

  // The class-name assertions above prove the component asks for a modifier.
  // They do not prove the modifier does anything: the whole gap and align
  // section could be deleted from layout.css and every one of them would stay
  // green. jsdom evaluates no stylesheet, so the rule text is the contract.
  it('backs every gap step with the matching space token', () => {
    const rules = cssRules(LAYOUT_CSS);
    for (const step of [1, 2, 3, 4, 5, 6, 8]) {
      const rule = rules.find(
        (r) =>
          r.selector.includes(`.vt-stack--gap-${step}`) &&
          r.selector.includes(`.vt-inline--gap-${step}`) &&
          r.selector.includes(`.vt-spread--gap-${step}`) &&
          r.selector.includes(`.vt-chipgroup--gap-${step}`),
      );
      expect(rule, `gap-${step} has no rule in layout.css`).toBeDefined();
      expect(rule!.body).toMatch(new RegExp(`gap:\\s*var\\(--ae-space-${step}\\)`));
    }
    // The scale skips 7, so a rule naming it would name a token that is not
    // defined anywhere.
    expect(LAYOUT_CSS).not.toMatch(/--ae-space-7\b/);
    expect(LAYOUT_CSS).not.toMatch(/gap-7\b/);
  });

  it('backs every align value with a real align-items rule', () => {
    const rules = cssRules(LAYOUT_CSS);
    const expected = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      stretch: 'stretch',
      baseline: 'baseline',
    } as const;
    for (const [value, css] of Object.entries(expected)) {
      const rule = rules.find((r) => r.selector.includes(`.vt-stack--align-${value}`));
      expect(rule, `align-${value} has no rule in layout.css`).toBeDefined();
      expect(rule!.selector).toContain(`.vt-inline--align-${value}`);
      expect(rule!.selector).toContain(`.vt-spread--align-${value}`);
      expect(rule!.body).toMatch(new RegExp(`align-items:\\s*${css}`));
    }
  });

  it('spreads rest props and forwards refs', () => {
    const stackRef = createRef<HTMLDivElement>();
    const inlineRef = createRef<HTMLDivElement>();
    const spreadRef = createRef<HTMLDivElement>();
    const chipsRef = createRef<HTMLDivElement>();
    render(
      <>
        <Stack ref={stackRef} data-testid="s" />
        <Inline ref={inlineRef} data-testid="i" />
        <Spread ref={spreadRef} data-testid="p" />
        <ChipGroup ref={chipsRef} data-testid="c" />
      </>,
    );
    expect(stackRef.current).toBe(screen.getByTestId('s'));
    expect(inlineRef.current).toBe(screen.getByTestId('i'));
    expect(spreadRef.current).toBe(screen.getByTestId('p'));
    expect(chipsRef.current).toBe(screen.getByTestId('c'));
  });
});

describe('Banner', () => {
  it('carries a glyph and a word, not only a tone colour', () => {
    const { container } = render(
      <Banner tone="warning" title="Cadence missed">
        You have not spoken to Lina in 90 days.
      </Banner>,
    );
    expect(container.querySelector('.vt-banner__glyph svg')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toHaveClass('u-visually-hidden');
    expect(screen.getByText('Cadence missed')).toBeInTheDocument();
  });

  it('gives every tone a different glyph, so the four are told apart by shape', () => {
    const tones = ['info', 'success', 'warning', 'danger'] as const;
    const shapes = tones.map((tone) => {
      const { container } = render(<Banner tone={tone}>message</Banner>);
      return container.querySelector('.vt-banner__glyph svg')!.innerHTML;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('draws every tone mark differently from the dismiss control beside it', () => {
    const tones = ['info', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      const { container } = render(
        <Banner tone={tone} onDismiss={() => {}}>
          message
        </Banner>,
      );
      const mark = container.querySelector('.vt-banner__glyph svg')!.innerHTML;
      const dismiss = container.querySelector('.vt-banner__x svg')!.innerHTML;
      // Two identical shapes one gap apart would leave the tone colour as the
      // only thing telling a state mark from a button.
      expect(mark, `${tone} draws its mark as the dismiss X`).not.toEqual(dismiss);
    }
  });

  it('names each tone in words', () => {
    const words = { info: 'Note', success: 'Success', warning: 'Warning', danger: 'Error' } as const;
    for (const [tone, word] of Object.entries(words)) {
      const { container } = render(
        <Banner tone={tone as keyof typeof words}>message</Banner>,
      );
      expect(container.querySelector('.u-visually-hidden')).toHaveTextContent(word);
    }
  });

  it('interrupts for a failure and waits to be read otherwise', () => {
    render(<Banner tone="danger">Import failed</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Import failed');
    render(<Banner tone="success">Saved</Banner>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('renders an action and a dismiss control', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Banner tone="info" action={<button type="button">Review</button>} onDismiss={onDismiss}>
        Two imports need review.
      </Banner>,
    );
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('spreads rest props and forwards its ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Banner ref={ref} data-testid="banner">
        note
      </Banner>,
    );
    expect(ref.current).toBe(screen.getByTestId('banner'));
  });
});

describe('Disclosure', () => {
  it('toggles aria-expanded and the panel with it', async () => {
    const user = userEvent.setup();
    render(<Disclosure label="Provenance">Imported from a calendar export.</Disclosure>);

    const trigger = screen.getByRole('button', { name: /Provenance/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Imported from a calendar export.')).not.toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Imported from a calendar export.')).toBeVisible();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('points aria-controls at the panel it actually toggles', () => {
    render(<Disclosure label="Provenance">body</Disclosure>);
    const trigger = screen.getByRole('button', { name: /Provenance/ });
    const id = trigger.getAttribute('aria-controls')!;
    expect(id).toBeTruthy();
    // The panel is hidden rather than unmounted, so the id always resolves.
    expect(document.getElementById(id)).toHaveTextContent('body');
  });

  it('opens from defaultOpen without being told again', () => {
    render(
      <Disclosure label="Provenance" defaultOpen>
        body
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: /Provenance/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the count out of the trigger name', () => {
    render(
      <Disclosure label="Provenance" meta={12}>
        body
      </Disclosure>,
    );
    // Inside the button the count concatenated straight onto the label and the
    // accessible name came out as "Provenance12".
    const trigger = screen.getByRole('button', { name: 'Provenance' });
    expect(trigger).not.toHaveTextContent('12');
    expect(trigger.querySelector('.vt-disclosure__meta')).toBeNull();
    // Still rendered, still beside the label.
    expect(screen.getByText('12')).toHaveClass('vt-disclosure__meta');
  });

  it('stays where the caller puts it when controlled', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Disclosure label="Provenance" open={false} onOpenChange={onOpenChange}>
        body
      </Disclosure>,
    );
    const trigger = screen.getByRole('button', { name: /Provenance/ });
    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

const TAB_ITEMS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

function TabsHarness({ initial = 'all' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs label="Task views" tabs={TAB_ITEMS} value={value} onChange={setValue}>
      Panel for {value}
    </Tabs>
  );
}

describe('Tabs', () => {
  it('uses the tab roles and says which one is selected', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist', { name: 'Task views' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Panel for all');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]!.id);
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
  });

  it('is one tab stop, not one per tab', () => {
    render(<TabsHarness initial="open" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '-1');
    expect(tabs[1]).toHaveAttribute('tabindex', '0');
    expect(tabs[2]).toHaveAttribute('tabindex', '-1');
  });

  it('keeps a tab stop when the value matches no tab', async () => {
    const user = userEvent.setup();
    // A value that matches nothing used to put every tab at -1, so the strip
    // had no home for its roving tabindex: Tab walked straight past it and the
    // arrow keys, which do handle the unmatched case, could never fire.
    render(<Tabs label="Task views" tabs={TAB_ITEMS} value="archived" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);

    await user.tab();
    expect(tabs[0]).toHaveFocus();
  });

  it('names the panel even when the value matches no tab', () => {
    render(
      <Tabs label="Task views" tabs={TAB_ITEMS} value="archived" onChange={vi.fn()}>
        Nothing here
      </Tabs>,
    );
    const panel = screen.getByRole('tabpanel');
    // A dangling aria-labelledby, or none at all, leaves the panel unnamed.
    expect(panel).not.toHaveAttribute('aria-labelledby');
    expect(panel).toHaveAccessibleName('Task views');
  });

  it('recovers with the arrow keys from a value that matches no tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs label="Task views" tabs={TAB_ITEMS} value="archived" onChange={onChange} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('open');
  });

  it('makes the panel a tab stop only when it holds nothing focusable', () => {
    // The APG puts tabindex 0 on a tabpanel only when the panel has no
    // focusable content. Always focusable means a redundant stop in front of
    // the panel's own first control.
    render(
      <Tabs label="Task views" tabs={TAB_ITEMS} value="all" onChange={vi.fn()}>
        Plain prose, nothing to focus.
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0');
  });

  it('leaves the panel out of the tab order when its content is focusable', () => {
    render(
      <Tabs label="Task views" tabs={TAB_ITEMS} value="all" onChange={vi.fn()}>
        <button type="button">Add task</button>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('tabindex');
  });

  it('moves selection and focus with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    screen.getAllByRole('tab')[0]!.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')[1]).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')[0]).toHaveFocus();
  });

  it('wraps at both ends and jumps with Home and End', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    screen.getAllByRole('tab')[0]!.focus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('reports the value on click, not the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs label="Task views" tabs={TAB_ITEMS} value="all" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it('leaves aria-controls off when there is no panel to control', () => {
    render(<Tabs label="Task views" tabs={TAB_ITEMS} value="all" onChange={vi.fn()} />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByRole('tab', { name: 'All' })).not.toHaveAttribute('aria-controls');
  });

  it('renders a glyph and a count beside the label', () => {
    render(
      <Tabs
        label="Task views"
        tabs={[{ value: 'all', label: 'All', glyph: 'task', count: 12 }]}
        value="all"
        onChange={vi.fn()}
      />,
    );
    const tab = screen.getByRole('tab', { name: /All/ });
    expect(tab.querySelector('svg')).toBeInTheDocument();
    expect(tab).toHaveTextContent('12');
  });

  it('spreads rest props and forwards its ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Tabs
        ref={ref}
        data-testid="tabs"
        label="Task views"
        tabs={TAB_ITEMS}
        value="all"
        onChange={vi.fn()}
      />,
    );
    expect(ref.current).toBe(screen.getByTestId('tabs'));
  });
});

// jsdom loads no stylesheet, so a class-name assertion proves only that the
// component asked for a class. These pin the rules those classes resolve to,
// following the pattern feedback.test.tsx uses for components.css: without
// them the whole stylesheet could be emptied and the suite would stay green.
describe('layout.css', () => {
  it('gives no hover rule any travel', () => {
    // Hover is not a state change (ch.08), so it gets tone and never movement.
    const hoverRules = cssRules(LAYOUT_CSS).filter((r) => r.selector.includes(':hover'));
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const rule of hoverRules) {
      expect(rule.body, rule.selector).not.toMatch(/transform\s*:/);
      expect(rule.body, rule.selector).not.toMatch(/translate\s*:/);
    }
  });

  it('lets selection win over hover without an !important', () => {
    const rules = cssRules(LAYOUT_CSS);
    const hover = rules.find(
      (r) => r.selector.includes('.vt-row--interactive') && r.selector.includes(':hover'),
    );
    // (0,2,0) for the hover rule against (0,1,0) for the selected rule meant a
    // selected row de-selected itself under the cursor.
    expect(hover?.selector).toContain(':not(.vt-row--selected)');
    expect(LAYOUT_CSS).not.toMatch(/!important/);
  });

  it('draws the selected marker bar in the accent', () => {
    const marker = cssRules(LAYOUT_CSS).find((r) => r.selector === '.vt-row--selected::before');
    expect(marker, 'the selected marker bar is gone from layout.css').toBeDefined();
    expect(marker!.body).toMatch(/content:\s*''/);
    expect(marker!.body).toMatch(/width:\s*2px/);
    expect(marker!.body).toMatch(/background:\s*var\(--ae-accent\)/);
    const ground = cssRules(LAYOUT_CSS).find((r) => r.selector === '.vt-row--selected');
    expect(ground!.body).toMatch(/background:\s*var\(--ae-accent-bg\)/);
  });

  it('keeps the card hover tone gated on the interactive modifier', () => {
    const rules = cssRules(LAYOUT_CSS);
    const cardHover = rules.filter(
      (r) => r.selector.includes('.vt-card') && r.selector.includes(':hover'),
    );
    expect(cardHover.length).toBe(1);
    expect(cardHover[0]!.selector).toBe('.vt-card--interactive:hover');
    expect(cardHover[0]!.body).toMatch(/border-color:\s*var\(--ae-border-strong\)/);
  });

  it('spends only tokens on colour, duration and easing', () => {
    expect(LAYOUT_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(LAYOUT_CSS).not.toMatch(/cubic-bezier/);
    const durations = [...LAYOUT_CSS.matchAll(/(transition|animation)\s*:\s*([^;]+)/g)]
      .map((m) => m[2]!.trim())
      .filter((value) => value !== 'none');
    expect(durations.length).toBeGreaterThan(0);
    for (const value of durations) {
      expect(value, value).not.toMatch(/\d+m?s\b/);
      expect(value, value).toMatch(/var\(--ae-dur(-fast|-slow)?\)/);
    }
  });
});
