/**
 * The block model on screen.
 *
 * Every node the corpus can contain is listed here, and nothing else can
 * arrive: `scripts/docs/lib/markdown.mjs` parses a closed dialect, so this
 * renderer covers it exhaustively and never needs `dangerouslySetInnerHTML`.
 * That is the security argument for owning the parser — there is no HTML in
 * the pipeline to sanitise, because no stage ever produces any.
 *
 * Two rules shape the markup. Anything that can overflow gets its own
 * scrollable, focusable region rather than pushing the page sideways, because
 * a documentation page that scrolls horizontally has lost its measure. And
 * anything that carries meaning carries it in words: a callout says "Warning",
 * an external link says it opens in a new tab, a table has a caption. Colour
 * repeats those, it never states them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type DocsBlock,
  type DocsInline,
  CALLOUT_LABEL,
  isExternalDocsLink,
} from './docsModel.js';
import { DocsDiagram } from './DocsDiagram.js';
import { DocsExplainer } from './DocsExplainer.js';

/** Copy that reads as an instruction rather than a state, per CONTRIBUTING. */
const COPY_IDLE = 'Copy';

/**
 * One link, routed three ways.
 *
 * The builder has already turned every `*.md` reference into an application
 * route, so an internal link arrives here as a path and goes through the
 * router without a page load. An anchor stays a plain anchor so the browser
 * keeps its own scroll and history behaviour. Anything with a scheme leaves
 * the app, which the reader is told in words before they follow it.
 */
export function DocsLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith('#')) {
    return (
      <a className="docs-link" href={href}>
        {children}
      </a>
    );
  }
  if (isExternalDocsLink(href)) {
    const mail = href.startsWith('mailto:');
    return (
      <a
        className="docs-link docs-link--external"
        href={href}
        {...(mail ? {} : { target: '_blank', rel: 'noreferrer' })}
      >
        {children}
        {!mail && (
          <>
            <span aria-hidden="true" className="docs-link__mark">
              ↗
            </span>
            <span className="u-visually-hidden"> (opens in a new tab)</span>
          </>
        )}
      </a>
    );
  }
  return (
    <Link className="docs-link" to={href}>
      {children}
    </Link>
  );
}

/** Inline nodes, recursively. Keys are positional because the model is a tree. */
export function Inlines({ nodes }: { nodes: readonly DocsInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;
        switch (node.type) {
          case 'text':
            return <span key={key}>{node.value}</span>;
          case 'code':
            return (
              <code key={key} className="docs-code-inline">
                {node.value}
              </code>
            );
          case 'strong':
            return (
              <strong key={key}>
                <Inlines nodes={node.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={key}>
                <Inlines nodes={node.children} />
              </em>
            );
          case 'link':
            return (
              <DocsLink key={key} href={node.href}>
                <Inlines nodes={node.children} />
              </DocsLink>
            );
          case 'image':
            return <img key={key} className="docs-inline-image" src={node.src} alt={node.alt} />;
        }
      })}
    </>
  );
}

/**
 * Copy to clipboard, reporting its own failure.
 *
 * `navigator.clipboard` rejects on a denied permission, an insecure context or
 * an unfocused document. A button that silently does nothing in those cases
 * teaches the reader that copying is broken; one that says so tells them why.
 * The same reasoning is written out at routes/reference/EntityCatalog.tsx.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 2000);
  }, [value]);

  return (
    <button
      type="button"
      className="docs-copy"
      data-state={state}
      onClick={() => void copy()}
      aria-label={label}
    >
      <span aria-hidden="true">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Blocked' : COPY_IDLE}
      </span>
      <span className="u-visually-hidden" role="status">
        {state === 'copied'
          ? 'Copied to the clipboard'
          : state === 'failed'
            ? 'The browser blocked the copy. Select the text and copy it manually.'
            : ''}
      </span>
    </button>
  );
}

/**
 * A code block. No syntax colour: DESIGN.md reserves colour for meaning, and a
 * keyword being a keyword is not a state the reader needs reported. The
 * language is named in words above the block instead, which also survives
 * being read aloud.
 */
function CodeBlock({ lang, code }: { lang: string | null; code: string }) {
  return (
    <div className="docs-code">
      <div className="docs-code__bar">
        <span className="docs-code__lang">{lang ?? 'text'}</span>
        <CopyButton value={code} label={`Copy the ${lang ?? 'code'} example`} />
      </div>
      <pre className="docs-code__body" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * A table in a region of its own.
 *
 * Wide reference tables are the one thing in a documentation corpus that
 * cannot be made narrow, so the table scrolls inside its own box and the box
 * is focusable. A scroll container that cannot take focus is one a keyboard
 * user cannot scroll, which quietly hides the rightmost columns from them.
 */
function DataTable({ block }: { block: Extract<DocsBlock, { type: 'table' }> }) {
  const caption = block.head.map((cell) => plainText(cell)).join(', ');
  return (
    <div
      className="docs-table"
      role="region"
      aria-label={`Table: ${caption}`}
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {block.head.map((cell, index) => (
              <th key={index} scope="col" data-align={block.align[index] ?? 'left'}>
                <Inlines nodes={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row" data-align={block.align[cellIndex] ?? 'left'}>
                    <Inlines nodes={cell} />
                  </th>
                ) : (
                  <td key={cellIndex} data-align={block.align[cellIndex] ?? 'left'}>
                    <Inlines nodes={cell} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline nodes flattened to text, for an accessible name. */
export function plainText(nodes: readonly DocsInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        case 'image':
          return node.alt;
        default:
          return plainText(node.children);
      }
    })
    .join('');
}

/**
 * A list item holding one paragraph renders that paragraph's contents
 * directly. Wrapping it in `<p>` would give a two-word item the vertical
 * rhythm of a section, and a tight list is the whole reason to use one.
 */
function ListItem({ blocks }: { blocks: readonly DocsBlock[] }) {
  if (blocks.length === 1 && blocks[0]!.type === 'paragraph') {
    return <Inlines nodes={blocks[0]!.children} />;
  }
  return <DocsBlocks blocks={blocks} />;
}

function Block({ block }: { block: DocsBlock }) {
  switch (block.type) {
    case 'heading': {
      // Level 1 belongs to the page header, which is rendered from metadata,
      // so the builder strips it. Anything deeper than 6 has no element.
      const level = Math.min(Math.max(block.level, 2), 6);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      // A heading takes its name from its contents, and the permalink inside it
      // is descriptive on purpose, so without this the heading announced as
      // "Two halves that are maintained differently Link to this section: Two
      // halves that are maintained differently". Pointing the heading at the
      // span keeps the permalink's own name useful in a list of links while
      // leaving the heading named after the section.
      const labelId = `${block.id}-label`;
      return (
        <Tag className="docs-heading" id={block.id} aria-labelledby={labelId}>
          <span id={labelId}>
            <Inlines nodes={block.children} />
          </span>
          <a
            className="docs-heading__anchor"
            href={`#${block.id}`}
            aria-label={`Link to this section: ${block.text}`}
          >
            <span aria-hidden="true">#</span>
          </a>
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="docs-p">
          <Inlines nodes={block.children} />
        </p>
      );
    case 'code':
      return <CodeBlock lang={block.lang} code={block.code} />;
    case 'rule':
      return <hr className="docs-rule" />;
    case 'callout':
      return (
        <aside className="docs-callout" data-tone={block.tone}>
          <p className="docs-callout__label">{CALLOUT_LABEL[block.tone]}</p>
          <div className="docs-callout__body">
            <DocsBlocks blocks={block.children} />
          </div>
        </aside>
      );
    case 'quote':
      return (
        <blockquote className="docs-quote">
          <DocsBlocks blocks={block.children} />
        </blockquote>
      );
    case 'list':
      return block.ordered ? (
        <ol className="docs-list" data-ordered="true">
          {block.items.map((item, index) => (
            <li key={index}>
              <ListItem blocks={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="docs-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <ListItem blocks={item} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <DataTable block={block} />;
    case 'diagram':
      return <DocsDiagram spec={block.spec} />;

    case 'explainer':
      return <DocsExplainer id={block.id} />;

    case 'figure':
      return (
        <figure className="docs-figure">
          <img src={block.src} alt={block.caption} />
          <figcaption>{block.caption}</figcaption>
        </figure>
      );
  }
}

export function DocsBlocks({ blocks }: { blocks: readonly DocsBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={`${block.type}-${index}`} block={block} />
      ))}
    </>
  );
}
