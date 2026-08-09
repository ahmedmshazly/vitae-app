import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandOverlay, Menu, Modal, Popover, RegisterRule, Section, Tooltip, TooltipProvider } from './overlay.js';

function ControlledModal({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open modal</button>
      <Modal open={open} onOpenChange={setOpen} title="Delete this record?" description="This can be undone.">
        {children ?? <input aria-label="Name" />}
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is closed until opened, and renders title/description once open', async () => {
    const user = userEvent.setup();
    render(<ControlledModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('vt-modal');
    expect(screen.getByText('Delete this record?')).toBeInTheDocument();
    expect(screen.getByText('This can be undone.')).toBeInTheDocument();
  });

  it('moves focus to the first form control on open, not the close button', async () => {
    const user = userEvent.setup();
    render(<ControlledModal />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ControlledModal />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix's return-focus-to-opener on close relies on real browser
    // focus/blur sequencing that jsdom doesn't model even with a waitFor
    // retry, verified in e2e (foundation.spec.ts) instead, in a real
    // browser, rather than asserted here against a false negative.
  });

  it('closes via the X button and calls onOpenChange', async () => {
    const user = userEvent.setup();
    render(<ControlledModal />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('CommandOverlay', () => {
  it('renders its own visible surface class and an accessible (hidden) title', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <CommandOverlay open={open} onOpenChange={setOpen} title="Quick capture">
          <input aria-label="Capture text" />
        </CommandOverlay>
      );
    }
    render(<Wrapper />);
    const dialog = await screen.findByRole('dialog', { name: 'Quick capture' });
    expect(dialog).toHaveClass('vt-palette');
    expect(screen.getByLabelText('Capture text')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to whatever opened it, even when the caller unmounts it', async () => {
    const user = userEvent.setup();
    // Every caller renders the palette conditionally, which tears the Radix
    // Root down in the same commit that closes it, so Radix's own restore
    // effect never runs and focus fell to <body>.
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Capture</button>
          {open && (
            <CommandOverlay open onOpenChange={setOpen} title="Quick capture">
              <input aria-label="Capture text" />
            </CommandOverlay>
          )}
        </>
      );
    }
    render(<Wrapper />);
    const opener = screen.getByRole('button', { name: 'Capture' });
    await user.click(opener);
    expect(screen.getByLabelText('Capture text')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('Tooltip', () => {
  it('shows its content on hover and hides on Escape', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Explains the thing">
          <button>?</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: '?' }));
    // Radix renders the visible content plus a visually-hidden a11y echo
    // that also carries role="tooltip", findByRole targets the semantic
    // element unambiguously, unlike a text match against both copies.
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Explains the thing');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('shows its content on click (not hover) and dismisses on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>Filters</button>}>
        <div>Filter panel</div>
      </Popover>,
    );
    await user.hover(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByText('Filter panel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByText('Filter panel')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Filter panel')).not.toBeInTheDocument();
  });
});

describe('Menu', () => {
  it('renders grouped items and fires onSelect with the chosen key', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={<button>Actions</button>}
        onSelect={onSelect}
        groups={[
          { label: 'Record', items: [{ key: 'edit', label: 'Edit' }, { key: 'delete', label: 'Delete' }] },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByText('Record')).toBeInTheDocument();
    await user.click(screen.getByText('Delete'));
    expect(onSelect).toHaveBeenCalledWith('delete');
  });

  it('lays groups out side-by-side when columns is set', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        trigger={<button>Add</button>}
        onSelect={() => {}}
        columns
        groups={[{ items: [{ key: 'a', label: 'A' }] }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveClass('vt-menu', 'vt-menu--columns');
  });
});

describe('RegisterRule', () => {
  it('is a plain, silent rule when there is nothing true to encode', () => {
    const { container } = render(<RegisterRule />);
    const rule = container.querySelector('.vt-register')!;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(rule.querySelectorAll('.vt-register__tick')).toHaveLength(0);
  });

  it('names the active tick, not just the scale', () => {
    render(
      <RegisterRule
        label="Days of this week"
        activeIndex={2}
        ticks={[
          { at: 0.1, label: 'Monday' },
          { at: 0.5, label: 'Tuesday' },
          { at: 0.9, label: 'Wednesday' },
        ]}
      />,
    );
    // "Days of this week" alone would say what the ticks are but not where you
    // are, the whole point of the active one.
    expect(screen.getByRole('img', { name: 'Days of this week: Wednesday' })).toBeInTheDocument();
  });

  it('marks exactly one tick active and positions each from its own `at`', () => {
    const { container } = render(
      <RegisterRule
        label="Revisions"
        activeIndex={0}
        ticks={[
          { at: 0.25, label: 'v1' },
          { at: 0.75, label: 'v2' },
        ]}
      />,
    );
    const ticks = [...container.querySelectorAll<HTMLElement>('.vt-register__tick')];
    expect(ticks.map((t) => t.classList.contains('vt-register__tick--on'))).toEqual([true, false]);
    expect(ticks.map((t) => t.style.left)).toEqual(['25%', '75%']);
  });

  it('survives two ticks that happen to carry the same label', () => {
    // Labels are the caller's data, not identity, two interactions of the
    // same kind on the same day produce the same label, and keying on it made
    // React warn and reuse the wrong node.
    const { container } = render(
      <RegisterRule
        label="Interactions"
        activeIndex={1}
        ticks={[
          { at: 0.3, label: 'coffee on 2026-08-07' },
          { at: 0.7, label: 'coffee on 2026-08-07' },
        ]}
      />,
    );
    const ticks = [...container.querySelectorAll<HTMLElement>('.vt-register__tick')];
    expect(ticks).toHaveLength(2);
    expect(ticks.map((t) => t.style.left)).toEqual(['30%', '70%']);
    expect(ticks[1]).toHaveClass('vt-register__tick--on');
  });

  it('falls back to the scale label when no tick is active', () => {
    render(<RegisterRule label="Revisions" ticks={[{ at: 0.5, label: 'v1' }]} />);
    expect(screen.getByRole('img', { name: 'Revisions' })).toBeInTheDocument();
  });
});

describe('Section', () => {
  it('keeps a space between the title and its count', () => {
    render(<Section title="Connections" meta={5}>rows</Section>);
    // The heading is a flex container, which drops a whitespace-only text
    // node between children: "Connections 5" rendered as "Connections5".
    // The gap has to come from CSS, and the two have to be separate nodes.
    const heading = screen.getByRole('heading', { name: /Connections/ });
    expect(heading.querySelector('.vt-section__meta')).toHaveTextContent('5');
    expect(heading.firstChild).not.toBe(heading.querySelector('.vt-section__meta'));
  });

  it('names its region so it is a landmark, not an anonymous run of rows', () => {
    render(<Section title="History">rows</Section>);
    const region = screen.getByRole('region', { name: 'History' });
    expect(region).toHaveTextContent('rows');
  });

  it('omits the meta slot entirely when there is nothing to count', () => {
    const { container } = render(<Section title="Notes">body</Section>);
    expect(container.querySelector('.vt-section__meta')).toBeNull();
  });

  it('puts region actions beside the title, outside the heading', () => {
    render(
      <Section title="Connections" actions={<button>Add connection</button>}>
        rows
      </Section>,
    );
    const add = screen.getByRole('button', { name: 'Add connection' });
    expect(add.closest('h2')).toBeNull();
    expect(add.closest('.vt-section__actions')).not.toBeNull();
  });
});
