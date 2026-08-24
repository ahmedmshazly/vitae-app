/**
 * Explainers that run the shipped algorithm, not a description of it.
 *
 * The claim worth testing is exactly that. So these compute the expected answer
 * by calling the same `@vitae/core` function the product calls and assert the
 * surface shows it — if the explainer ever reimplemented the formula to make a
 * nicer demonstration, these fail. They also pin the reference date, because an
 * example that reads the clock cannot be written down or compared.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TIE_STRENGTH, computeTieStrength, escapeLatex } from '@vitae/core';
import { DocsExplainer, hasDocsExplainer } from './DocsExplainer.js';

const REFERENCE = new Date('2026-08-24T12:00:00.000Z');
const daysAgo = (days: number) => new Date(REFERENCE.getTime() - days * 86_400_000).toISOString();

/** The state the tie-strength explainer opens in. */
const OPENING = computeTieStrength({
  closeness: 3,
  now: REFERENCE,
  interactions: [
    { kind: 'meeting', occurredAt: daysAgo(12) },
    { kind: 'message', occurredAt: daysAgo(40) },
    { kind: 'call', occurredAt: daysAgo(95) },
  ],
});

/** The value beside a named term in an explainer's readout. */
function readout(label: string): string {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent ?? '';
}

describe('which algorithms have a worked example', () => {
  it('knows the ones that are written', () => {
    expect(hasDocsExplainer('tie-strength')).toBe(true);
    expect(hasDocsExplainer('text')).toBe(true);
    expect(hasDocsExplainer('latex-escape')).toBe(true);
  });

  it('says so plainly when a page names one that is not', () => {
    expect(hasDocsExplainer('pagerank')).toBe(false);
    render(<DocsExplainer id="pagerank" />);
    expect(screen.getByText(/No interactive example is written for/)).toBeInTheDocument();
  });
});

describe('how close a relationship is judged to be', () => {
  it('shows what the shipped function returns, to three places', () => {
    render(<DocsExplainer id="tie-strength" />);
    expect(readout('Strength')).toBe(OPENING.strength.toFixed(3));
    expect(readout('Decayed intensity')).toBe(OPENING.intensity.toFixed(3));
    expect(readout('Status')).toBe(OPENING.status);
  });

  it('breaks the score into the parts it is made of', () => {
    render(<DocsExplainer id="tie-strength" />);
    expect(readout('From closeness')).toBe(OPENING.factors.closeness.toFixed(3));
    expect(readout('From interactions')).toBe(OPENING.factors.intensity.toFixed(3));
  });

  it('states its reference date, so the example can be written down', () => {
    render(<DocsExplainer id="tie-strength" />);
    expect(screen.getAllByText(/Reference date 24 August 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demonstration data only/).length).toBeGreaterThan(0);
  });

  it('recomputes when the reader changes an input', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="tie-strength" />);
    const before = readout('Strength');

    const rows = within(screen.getByRole('table', { name: /Interactions/ })).getAllByRole('row');
    await user.click(within(rows[1]!).getByRole('button', { name: /^Remove/ }));

    const expected = computeTieStrength({
      closeness: 3,
      now: REFERENCE,
      interactions: [
        { kind: 'message', occurredAt: daysAgo(40) },
        { kind: 'call', occurredAt: daysAgo(95) },
      ],
    });
    expect(readout('Strength')).toBe(expected.strength.toFixed(3));
    expect(readout('Strength')).not.toBe(before);
  });

  it('shows the real weight of each kind of interaction', () => {
    render(<DocsExplainer id="tie-strength" />);
    const table = screen.getByRole('table', { name: /Interactions/ });
    expect(within(table).getByText(TIE_STRENGTH.kindWeights.meeting!.toFixed(2))).toBeInTheDocument();
  });

  it('names the decay constant from the source rather than a number in prose', () => {
    render(<DocsExplainer id="tie-strength" />);
    expect(
      screen.getByText(new RegExp(`${TIE_STRENGTH.tauDays}-day time constant`)),
    ).toBeInTheDocument();
  });
});

describe('what counts as a word', () => {
  it('keeps a technical spelling intact', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="text" />);
    const field = screen.getByLabelText('Some text');
    await user.clear(field);
    await user.type(field, 'node.js and c++');

    const table = screen.getByRole('table', { name: /Tokens/ });
    expect(within(table).getByRole('rowheader', { name: 'node.js' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'c++' })).toBeInTheDocument();
  });

  it('says which tokens are dropped as stopwords', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="text" />);
    const field = screen.getByLabelText('Some text');
    await user.clear(field);
    await user.type(field, 'the migrations');

    const table = screen.getByRole('table', { name: /Tokens/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('No, it is a stopword');
    expect(rows[1]).toHaveTextContent('Yes');
  });

  it('reports nothing rather than an empty table', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="text" />);
    await user.clear(screen.getByLabelText('Some text'));
    expect(screen.getByText('Nothing here is a word.')).toBeInTheDocument();
  });
});

describe('making text safe to compile', () => {
  it('shows exactly what the shipped escaper produces', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="latex-escape" />);
    const field = screen.getByLabelText('Text a person typed');
    await user.clear(field);
    // No braces: userEvent reads them as its own key syntax, and the point
    // here is what the escaper does, not what the test harness does.
    const typed = '50% of $10 & ~x_y^z';
    await user.type(field, typed);

    expect(readout('What reaches the compiler')).toBe(escapeLatex(typed));
  });

  it('says when nothing needed escaping', async () => {
    const user = userEvent.setup();
    render(<DocsExplainer id="latex-escape" />);
    const field = screen.getByLabelText('Text a person typed');
    await user.clear(field);
    await user.type(field, 'plain words only');

    expect(readout('Changed')).toBe('No, nothing needed it');
  });
});
