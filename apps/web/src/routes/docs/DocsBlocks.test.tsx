/**
 * The renderer for the compiled block model.
 *
 * The dialect is closed — `scripts/docs/lib/markdown.mjs` emits nine block
 * types and six inline types and nothing else — so this suite renders one of
 * each and checks the parts a reader depends on but a screenshot would not
 * show: what a link says about where it goes, what a table's region is called,
 * what a copy button reports when the browser refuses.
 *
 * The first test is the security one. Nothing in this pipeline uses
 * `dangerouslySetInnerHTML`; markup arriving inside a text node must reach the
 * page as text a reader can see, not as elements a browser will run.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../test/a11y.js';
import { DocsBlocks, plainText } from './DocsBlocks.js';
import type { DocsBlock } from './docsModel.js';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
});

function text(value: string) {
  return [{ type: 'text' as const, value }];
}

function draw(blocks: readonly DocsBlock[]) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="docs-prose">
        <DocsBlocks blocks={blocks} />
      </div>
    </MemoryRouter>,
  );
}

describe('untrusted-looking content', () => {
  it('renders markup in a text node as text, never as elements', () => {
    const { container } = draw([
      { type: 'paragraph', children: text('<img src=x onerror="alert(1)"> and <b>bold</b>') },
    ]);
    expect(screen.getByText(/<img src=x onerror/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('headings', () => {
  it('starts at level 2, because level 1 is the page title in the header', () => {
    draw([{ type: 'heading', level: 1, id: 'a', text: 'Overview', children: text('Overview') }]);
    expect(screen.getByRole('heading', { level: 2, name: /Overview/ })).toHaveAttribute('id', 'a');
  });

  it('clamps a heading deeper than the element set allows', () => {
    draw([{ type: 'heading', level: 9, id: 'z', text: 'Deep', children: text('Deep') }]);
    expect(screen.getByRole('heading', { level: 6, name: /Deep/ })).toBeInTheDocument();
  });

  // The name is asserted exactly, not with a pattern. A heading is named from
  // its contents, so the descriptive permalink inside it was being folded in
  // and every heading announced its own text twice. A `/Identifiers/` match
  // passes against the doubled name; only an exact one fails.
  it('is named after its section, and not also after the permalink inside it', () => {
    draw([{ type: 'heading', level: 2, id: 'ids', text: 'Identifiers', children: text('Identifiers') }]);
    expect(screen.getByRole('heading', { level: 2, name: 'Identifiers' })).toBeInTheDocument();
  });

  // A permalink whose only content is "#" is a link with no name. The label is
  // what makes it usable from a screen reader's list of links.
  it('gives each permalink a name that says which section it points at', () => {
    draw([{ type: 'heading', level: 2, id: 'ids', text: 'Identifiers', children: text('Identifiers') }]);
    expect(screen.getByRole('link', { name: 'Link to this section: Identifiers' })).toHaveAttribute(
      'href',
      '#ids',
    );
  });
});

describe('links', () => {
  it('says an external link opens elsewhere, in words and not only with a glyph', () => {
    draw([
      {
        type: 'paragraph',
        children: [
          { type: 'link', href: 'https://example.com/spec', children: text('the specification') },
        ],
      },
    ]);
    const link = screen.getByRole('link', { name: /the specification/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAccessibleName(/opens in a new tab/);
  });

  it('does not claim a mail address opens a tab', () => {
    draw([
      {
        type: 'paragraph',
        children: [{ type: 'link', href: 'mailto:hello@example.com', children: text('write in') }],
      },
    ]);
    const link = screen.getByRole('link', { name: 'write in' });
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAccessibleName(/opens in a new tab/);
  });

  it('keeps an in-corpus link inside the router', () => {
    draw([
      {
        type: 'paragraph',
        children: [{ type: 'link', href: '/docs/meta/one', children: text('the first page') }],
      },
    ]);
    const link = screen.getByRole('link', { name: 'the first page' });
    expect(link).toHaveAttribute('href', '/docs/meta/one');
    expect(link).not.toHaveAttribute('target');
  });
});

describe('code', () => {
  const block: DocsBlock = { type: 'code', lang: 'bash', code: 'pnpm docs:check' };

  it('names the language in words instead of colouring the syntax', () => {
    draw([block]);
    expect(screen.getByText('bash')).toBeInTheDocument();
  });

  // A block that scrolls but cannot take focus hides its right-hand side from
  // anyone not using a pointer.
  it('lets the keyboard reach and scroll the block', () => {
    const { container } = draw([block]);
    expect(container.querySelector('pre')).toHaveAttribute('tabindex', '0');
  });

  it('copies the example and says it did', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    draw([block]);
    await user.click(screen.getByRole('button', { name: 'Copy the bash example' }));
    expect(writeText).toHaveBeenCalledWith('pnpm docs:check');
    expect(await screen.findByText('Copied to the clipboard')).toBeInTheDocument();
  });

  // A button that silently does nothing teaches the reader that copying is
  // broken. This one says the browser refused and what to do instead.
  it('reports a refused clipboard rather than swallowing it', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    draw([block]);
    await user.click(screen.getByRole('button', { name: 'Copy the bash example' }));
    expect(await screen.findByText(/blocked the copy/)).toBeInTheDocument();
  });
});

describe('tables', () => {
  const block: DocsBlock = {
    type: 'table',
    align: ['left', 'right'],
    head: [text('Key'), text('Default')],
    rows: [
      [text('PORT'), text('4000')],
      [text('HOST'), text('127.0.0.1')],
    ],
  };

  it('is a named region, so it can be found and scrolled from the keyboard', () => {
    draw([block]);
    const region = screen.getByRole('region', { name: 'Table: Key, Default' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  // Without a row header every cell is announced bare, and a reference table
  // read one cell at a time stops saying which row it is in.
  it('makes the first cell of each row that row’s header', () => {
    draw([block]);
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      expect(within(row).getByRole('rowheader')).toBeInTheDocument();
    }
    expect(screen.getByRole('rowheader', { name: 'PORT' })).toHaveAttribute('data-align', 'left');
    expect(screen.getByRole('cell', { name: '4000' })).toHaveAttribute('data-align', 'right');
  });
});

describe('the rest of the dialect', () => {
  it('labels a callout with its tone in words', () => {
    draw([
      {
        type: 'callout',
        tone: 'warning',
        children: [{ type: 'paragraph', children: text('This is gated.') }],
      },
    ]);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('This is gated.')).toBeInTheDocument();
  });

  it('renders a one-paragraph list item tight, with no paragraph of its own', () => {
    const { container } = draw([
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'paragraph', children: text('One line.') }]],
      },
    ]);
    expect(container.querySelector('li p')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('One line.');
  });

  it('keeps an ordered list ordered', () => {
    const { container } = draw([
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'paragraph', children: text('First.') }]],
      },
    ]);
    expect(container.querySelector('ol')).toHaveAttribute('data-ordered', 'true');
  });

  it('gives a figure the same words as its alternative text', () => {
    draw([{ type: 'figure', src: '/img/today.png', caption: 'The Today screen.' }]);
    expect(screen.getByRole('img', { name: 'The Today screen.' })).toBeInTheDocument();
    expect(screen.getByText('The Today screen.')).toBeInTheDocument();
  });

  it('renders quotes, rules and inline emphasis', () => {
    const { container } = draw([
      { type: 'rule' },
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'strong', children: text('Bold') },
              { type: 'em', children: text('italic') },
              { type: 'code', value: 'inline()' },
            ],
          },
        ],
      },
    ]);
    expect(container.querySelector('hr')).toBeInTheDocument();
    expect(container.querySelector('blockquote strong')).toHaveTextContent('Bold');
    expect(container.querySelector('blockquote em')).toHaveTextContent('italic');
    expect(screen.getByText('inline()')).toHaveClass('docs-code-inline');
  });
});

describe('plainText', () => {
  it('flattens nested inlines to the words a name needs', () => {
    expect(
      plainText([
        { type: 'text', value: 'A ' },
        { type: 'strong', children: [{ type: 'em', children: text('nested') }] },
        { type: 'text', value: ' ' },
        { type: 'code', value: 'value' },
        { type: 'image', src: '/x.png', alt: ' picture' },
      ]),
    ).toBe('A nested value picture');
  });
});

it('has no accessibility violations across the whole dialect', async () => {
  const { container } = draw([
    { type: 'heading', level: 2, id: 'h', text: 'Everything', children: text('Everything') },
    { type: 'paragraph', children: text('A paragraph.') },
    { type: 'code', lang: 'json', code: '{}' },
    { type: 'rule' },
    {
      type: 'callout',
      tone: 'note',
      children: [{ type: 'paragraph', children: text('A note.') }],
    },
    { type: 'quote', children: [{ type: 'paragraph', children: text('A quotation.') }] },
    { type: 'list', ordered: false, items: [[{ type: 'paragraph', children: text('An item.') }]] },
    {
      type: 'table',
      align: [null, null],
      head: [text('A'), text('B')],
      rows: [[text('1'), text('2')]],
    },
    { type: 'figure', src: '/x.png', caption: 'A capture of fictional demonstration data.' },
  ]);
  expect(await runAxe(container)).toHaveNoViolations();
});
