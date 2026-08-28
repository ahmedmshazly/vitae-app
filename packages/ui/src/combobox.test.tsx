import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState, type KeyboardEvent } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxItem, type ComboboxProps } from './combobox.js';
import { Modal } from './overlay.js';

const PEOPLE: ComboboxItem[] = [
  { value: 'lina', label: 'Lina Farouk', description: 'Staff engineer at Meridian', meta: 'person' },
  { value: 'dana', label: 'Dana Okafor', description: 'Design lead at Meridian', meta: 'person' },
  { value: 'sam', label: 'Sam Okonkwo', description: 'Recruiter at Northwind', meta: 'person' },
];

function Harness({ items = PEOPLE, onSelect = () => {}, ...rest }: Partial<ComboboxProps>) {
  const [query, setQuery] = useState('');
  return (
    <Combobox
      label="Search records"
      items={items}
      query={query}
      onQueryChange={setQuery}
      onSelect={onSelect}
      {...rest}
    />
  );
}

function input() {
  return screen.getByRole('combobox', { name: 'Search records' });
}
function options() {
  return screen.getAllByRole('option');
}
function activeOptionLabel(): string | null {
  const id = input().getAttribute('aria-activedescendant');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}
function selectedFlags(): string[] {
  return options().map((option) => option.getAttribute('aria-selected') ?? 'missing');
}

describe('Combobox ARIA', () => {
  it('wires the input to the listbox it controls and to the active option', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');

    await user.click(input());

    const listbox = await screen.findByRole('listbox', { name: 'Search records' });
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', listbox.id);
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);

    // The option the user moves to is announced by id, and marked rather than
    // only tinted.
    await user.keyboard('{ArrowDown}');
    const first = options()[0]!;
    expect(input()).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(options()[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('marks no option current until the user moves to one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());

    await screen.findByRole('listbox');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(selectedFlags()).toEqual(['false', 'false', 'false']);

    await user.keyboard('{ArrowDown}');
    expect(selectedFlags()).toEqual(['true', 'false', 'false']);
  });

  it('claims no popup while there is nothing to show', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} />);
    await user.click(input());
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the chosen value with a glyph and the word "Selected"', async () => {
    const user = userEvent.setup();
    render(<Harness value="dana" />);
    await user.click(input());
    const chosen = screen.getByRole('option', { name: /Dana Okafor/ });
    expect(within(chosen).getByTitle('Selected')).toBeInTheDocument();
    const other = screen.getByRole('option', { name: /Sam Okonkwo/ });
    expect(within(other).queryByTitle('Selected')).not.toBeInTheDocument();
  });
});

describe('Combobox keyboard', () => {
  it('opens a closed list on ArrowDown, at the first option', async () => {
    const user = userEvent.setup();
    render(<Harness openOnFocus={false} />);
    await user.click(input());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(activeOptionLabel()).toContain('Lina Farouk');
  });

  it('moves the active option with ArrowDown and ArrowUp, and stops at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());

    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Lina Farouk');
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Dana Okafor');
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
    // No wrap: the last option stays active rather than jumping to the top.
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    await user.keyboard('{ArrowUp}');
    expect(activeOptionLabel()).toContain('Dana Okafor');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOptionLabel()).toContain('Lina Farouk');
  });

  it('starts at the last option when ArrowUp opens the walk', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    await user.keyboard('{ArrowUp}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
  });

  it('jumps to the ends of the list with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
    await user.keyboard('{Home}');
    expect(activeOptionLabel()).toContain('Lina Farouk');
  });

  it('commits the active option on Enter and closes the list', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ value: 'dana' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('commits the active option on Tab, per the WAI-ARIA pattern', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(input());
    await user.keyboard('{End}');
    await user.tab();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ value: 'sam' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('tabs out of an untouched list without committing anything', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        <Harness onSelect={onSelect} />
        <button type="button">Save record</button>
      </>,
    );
    await user.click(input());
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    // No arrowing, no hover, no click: the list opened on focus and the user
    // is passing through the field.
    await user.tab();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save record' }));
  });

  it('never commits on Shift+Tab, which leaves the field backwards', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        <button type="button">Back</button>
        <Harness onSelect={onSelect} />
      </>,
    );
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    await user.tab({ shift: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('scrolls the option it just made active into view, without moving the page', async () => {
    const user = userEvent.setup();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<Harness />);
    await user.click(input());
    scroll.mockClear();

    await user.keyboard('{ArrowDown}');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    const scrolled = scroll.mock.instances.at(-1) as unknown as HTMLElement;
    expect(scrolled.textContent).toContain('Lina Farouk');
    scroll.mockRestore();
  });

  it('closes on Escape and leaves the typed text alone', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    await user.keyboard('Lina');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveValue('Lina');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });

  it('forgets the current option as soon as the query changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    // The caller answers the new query with the same rows; the highlight was
    // still chosen out of the old ones.
    await user.keyboard('F');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(selectedFlags()).toEqual(['false', 'false', 'false']);
  });

  it('hands the key over when the caller claims it first', async () => {
    const user = userEvent.setup();
    const onInputKeyDown = vi.fn((event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') event.preventDefault();
    });
    render(<Harness onInputKeyDown={onInputKeyDown} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(onInputKeyDown).toHaveBeenCalled();
    // The built-in handling did not also run, so the list did not move.
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
  });

  it('steps over a disabled option instead of stranding the keyboard on it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        items={[PEOPLE[0]!, { ...PEOPLE[1]!, disabled: true }, PEOPLE[2]!]}
      />,
    );
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Lina Farouk');
    await user.keyboard('{ArrowDown}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
    await user.keyboard('{Enter}');
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ value: 'sam' });
  });

  it('drops a current option the caller has since disabled, and gives Enter back', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const create: ComboboxItem = { value: 'new', label: "Create person 'Nadia Farouk'", kind: 'create' };
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <Harness items={[PEOPLE[0]!, create]} onSelect={onSelect} />
      </form>,
    );
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Create person');

    // The create is now in flight, so the row it is on can no longer be taken.
    rerender(
      <form onSubmit={onSubmit}>
        <Harness
          items={[PEOPLE[0]!, { ...create, disabled: true, disabledReason: 'Creating...' }]}
          onSelect={onSelect}
        />
      </form>,
    );
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(selectedFlags()).toEqual(['false', 'false']);

    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('gives up the active option when the list shrinks under it, and does not resurrect it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<Harness items={PEOPLE} onSelect={onSelect} />);
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    // A slower search answers with fewer rows than the keyboard has walked.
    rerender(<Harness items={[PEOPLE[0]!]} onSelect={onSelect} />);
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(selectedFlags()).toEqual(['false']);

    // The rows come back, and the row the user walked away from stays cold:
    // an index remembered across two lists is a value nobody chose.
    rerender(<Harness items={PEOPLE} onSelect={onSelect} />);
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(selectedFlags()).toEqual(['false', 'false', 'false']);
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('follows the option it made current when the caller reorders the list', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness items={PEOPLE} />);
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    rerender(<Harness items={[PEOPLE[2]!, PEOPLE[0]!, PEOPLE[1]!]} />);
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
    expect(selectedFlags()).toEqual(['true', 'false', 'false']);
  });

  it('leaves Enter alone when no option is active, so a form can still submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness items={[]} />
      </form>,
    );
    await user.click(input());
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape to the layer that has already handled it', async () => {
    const user = userEvent.setup();
    const seen: boolean[] = [];
    render(<Harness onInputKeyDown={(event) => seen.push(event.defaultPrevented)} />);
    await user.click(input());
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    // The dismissable layer listens on the document in the capture phase and
    // calls preventDefault itself, so the input's own handler is already too
    // late to close, or to keep, anything.
    expect(seen).toEqual([true]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not claim Escape while its list is shut', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness openOnFocus={false} onOpenChange={onOpenChange} />);
    await user.click(input());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('Combobox states', () => {
  it('reports a failed search as an alert rather than rendering as empty', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} error="The search service did not answer, retry." />);
    await user.click(input());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Search failed.');
    expect(alert).toHaveTextContent('The search service did not answer, retry.');
    // The failure is a state of the popup, so the input still reports it open.
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('announces a search in flight without claiming there are no matches', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} loading />);
    await user.click(input());
    expect(await screen.findByRole('status')).toHaveTextContent('Searching...');
    expect(input()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('shows the empty message only once something has been typed', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} />);
    await user.click(input());
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
    await user.keyboard('Okonkwo');
    expect(await screen.findByText('No matches.')).toBeInTheDocument();
  });

  it('offers create as a distinct option kind, selectable like any other', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        items={[PEOPLE[0]!, { value: 'new', label: "Create person 'Nadia Farouk'", kind: 'create' }]}
      />,
    );
    await user.click(input());
    const create = screen.getByRole('option', { name: /Create person/ });
    expect(create.className).toContain('vt-cbx__opt--create');
    await user.keyboard('{End}{Enter}');
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ value: 'new', kind: 'create' });
  });

  it('says an option is unavailable with a glyph and a word, not with tone', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        items={[
          PEOPLE[0]!,
          { ...PEOPLE[1]!, disabled: true, disabledReason: 'Already linked' },
          { ...PEOPLE[2]!, disabled: true },
        ]}
      />,
    );
    await user.click(input());

    const linked = screen.getByRole('option', { name: /Dana Okafor/ });
    expect(linked).toHaveAttribute('aria-disabled', 'true');
    expect(linked).toHaveTextContent('Already linked');
    expect(linked.querySelector('svg')).toBeInTheDocument();

    // No reason given still gets the word, never the colour on its own.
    expect(screen.getByRole('option', { name: /Sam Okonkwo/ })).toHaveTextContent('Unavailable');
    expect(screen.getByRole('option', { name: /Lina Farouk/ })).not.toHaveAttribute('aria-disabled');
  });

  it('takes no input at all while the field is disabled', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    expect(input()).toBeDisabled();
    await user.click(input());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Combobox pointer', () => {
  it('does not let a stationary pointer steal the option the keyboard just reached', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());

    // The pointer comes to rest over the first option.
    fireEvent.mouseMove(options()[0]!, { clientX: 20, clientY: 40 });
    expect(activeOptionLabel()).toContain('Lina Farouk');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    // Arrowing scrolls the list, and the browser fires a mousemove at
    // coordinates that never changed. A move that did not move is not a move.
    fireEvent.mouseMove(options()[0]!, { clientX: 20, clientY: 40 });
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
  });

  it('hands the active option back as soon as the pointer really moves', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    fireEvent.mouseMove(options()[0]!, { clientX: 20, clientY: 40 });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    fireEvent.mouseMove(options()[1]!, { clientX: 24, clientY: 62 });
    expect(activeOptionLabel()).toContain('Dana Okafor');
  });

  it('does not let a hovered unselectable row take the option the keyboard holds', async () => {
    const user = userEvent.setup();
    render(<Harness items={[PEOPLE[0]!, { ...PEOPLE[1]!, disabled: true }, PEOPLE[2]!]} />);
    await user.click(input());
    await user.keyboard('{End}');
    expect(activeOptionLabel()).toContain('Sam Okonkwo');

    fireEvent.mouseMove(options()[1]!, { clientX: 24, clientY: 62 });
    expect(activeOptionLabel()).toContain('Sam Okonkwo');
    expect(options()[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('does not select an unselectable row that is clicked anyway', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        items={[PEOPLE[0]!, { ...PEOPLE[1]!, disabled: true }, PEOPLE[2]!]}
      />,
    );
    await user.click(input());
    await user.click(screen.getByRole('option', { name: /Dana Okafor/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('selects on click and keeps focus in the input', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(input());
    await user.click(screen.getByRole('option', { name: /Dana Okafor/ }));
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ value: 'dana' });
    expect(document.activeElement).toBe(input());
  });

  it('stays open after a pick when the caller collects several values', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} keepOpenOnSelect />);
    await user.click(input());
    await user.click(screen.getByRole('option', { name: /Dana Okafor/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});

describe('Combobox layering', () => {
  it('portals the list, so an overflow container cannot clip it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <Harness />
      </div>,
    );
    await user.click(input());
    const listbox = await screen.findByRole('listbox');
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it('leaves the panel out of the focus order, so its role is not in conflict', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    const panel = (await screen.findByRole('listbox')).closest('.vt-cbx__panel');

    // Radix's FocusScope puts tabIndex -1 on its child. Presentational and
    // focusable at once is the axe presentation-role-conflict pattern.
    expect(panel).toHaveAttribute('role', 'presentation');
    expect(panel).not.toHaveAttribute('tabindex');
  });

  it('gives Escape to the list first, leaving the dialog around it open', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onOpenChange={() => {}} title="Link a record">
        <Harness />
      </Modal>,
    );
    // Modal focuses the first control, which is this combobox.
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not dismiss itself when the input it is anchored to is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.click(input());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});

// Comments are stripped once, here. A comment is not a rule, and leaving them
// in makes every selector match start at the comment above it.
const COMBOBOX_CSS = readFileSync(join(process.cwd(), 'src/styles/combobox.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function cssRules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}
function ruleBody(selector: string): string {
  return cssRules(COMBOBOX_CSS).find((r) => r.selector === selector)?.body ?? '';
}

describe('combobox.css', () => {
  it('opens on the entrance variant and leaves on the exit variant', () => {
    expect(ruleBody('.vt-cbx__panel')).toContain('animation: vt-rise-in var(--ae-dur) var(--ae-ease)');
    expect(ruleBody(".vt-cbx__panel[data-state='closed']")).toContain(
      'animation: vt-fade-out var(--ae-dur-fast) linear',
    );
  });

  it('carries the active option on a marker, not on tone alone', () => {
    const body = ruleBody('.vt-cbx__opt--on::before');
    expect(body).toContain('background: var(--ae-accent)');
    expect(body).toContain('width: 2px');
  });

  it('never puts travel on hover, and never renders below the 11px floor', () => {
    for (const rule of cssRules(COMBOBOX_CSS)) {
      if (rule.selector.includes(':hover')) expect(rule.body).not.toContain('transform:');
    }
    for (const size of COMBOBOX_CSS.matchAll(/font-size:\s*var\(--ae-text-([a-z0-9]+)\)/g)) {
      expect(['sm', 'base', 'md', 'lg']).toContain(size[1]);
    }
  });
});
