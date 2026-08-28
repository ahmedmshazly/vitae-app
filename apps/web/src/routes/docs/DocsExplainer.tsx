/**
 * Algorithms a reader can drive, running the real code.
 *
 * `@vitae/core`'s algorithms are pure functions with no I/O, which makes this
 * possible and makes it worth doing: these explainers import the same functions
 * the product calls and run them in the browser against inputs the reader
 * changes. Nothing is reimplemented for the documentation, so nothing can drift
 * from what ships. If the formula changes, this page changes with it.
 *
 * Every explainer fixes its reference date. An algorithm that reads the clock
 * would produce a different answer on every visit, which makes it impossible to
 * write down what it does, impossible to test, and impossible for two people to
 * compare what they are looking at. The date is stated on the surface rather
 * than hidden, because a worked example whose inputs are not all visible is not
 * a worked example.
 *
 * The output is decomposed into the same factors the product shows, not a
 * single number. A score a reader cannot take apart is a score they have to
 * take on trust, which is the opposite of what this documentation is for.
 */
import { useId, useMemo, useState } from 'react';
import {
  TIE_STRENGTH,
  computeTieStrength,
  escapeLatex,
  normalizeForMatch,
  stem,
  tokenize,
  STOPWORDS,
  type InteractionEvent,
} from '@vitae/core';

/**
 * The reference "now" every explainer computes against.
 *
 * Fixed, and shown to the reader. Demonstration data only.
 */
const REFERENCE = new Date('2026-08-24T12:00:00.000Z');
const REFERENCE_LABEL = '24 August 2026';

function daysAgo(days: number): string {
  return new Date(REFERENCE.getTime() - days * 86_400_000).toISOString();
}

function Figure({
  title,
  what,
  source,
  children,
}: {
  title: string;
  what: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className="docs-explainer">
      <header className="docs-explainer__head">
        <h3 className="docs-explainer__title">{title}</h3>
        <p className="docs-explainer__what">{what}</p>
        <p className="docs-explainer__source">
          Runs <span className="docs-mono">{source}</span> in this page. Reference date{' '}
          {REFERENCE_LABEL}. Demonstration data only.
        </p>
      </header>
      {children}
    </section>
  );
}

function Readout({ rows }: { rows: readonly (readonly [string, React.ReactNode])[] }) {
  return (
    <dl className="docs-explainer__readout">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Tie strength
// ---------------------------------------------------------------------------

const KINDS = Object.keys(TIE_STRENGTH.kindWeights);

interface Contact {
  key: number;
  kind: string;
  days: number;
}

const STARTING_CONTACTS: readonly Contact[] = [
  { key: 1, kind: 'meeting', days: 12 },
  { key: 2, kind: 'message', days: 40 },
  { key: 3, kind: 'call', days: 95 },
];

function TieStrengthExplainer() {
  const [closeness, setCloseness] = useState(3);
  const [contacts, setContacts] = useState<readonly Contact[]>(STARTING_CONTACTS);
  const [next, setNext] = useState(STARTING_CONTACTS.length + 1);
  const closenessId = useId();

  const result = useMemo(() => {
    const interactions: InteractionEvent[] = contacts.map((contact) => ({
      kind: contact.kind,
      occurredAt: daysAgo(contact.days),
    }));
    return computeTieStrength({ closeness, interactions, now: REFERENCE });
  }, [closeness, contacts]);

  const round = (value: number) => value.toFixed(3);

  return (
    <Figure
      title="How close a relationship is judged to be"
      what={
        'Every interaction adds intensity that decays over time, so a burst of contact a year ago '
        + 'counts for less than steady contact this quarter. Add a contact, move one further into '
        + 'the past, and watch which part of the score moves.'
      }
      source="packages/core/src/algorithms/tie-strength.ts"
    >
      <div className="docs-explainer__inputs">
        <p className="docs-explainer__field">
          <label htmlFor={closenessId}>Self-reported closeness</label>
          <input
            id={closenessId}
            type="range"
            min={1}
            max={5}
            step={1}
            value={closeness}
            onChange={(event) => setCloseness(Number(event.target.value))}
          />
          <output className="docs-mono">{closeness} of 5</output>
        </p>

        <table className="docs-table docs-explainer__table">
          <caption>Interactions</caption>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Days ago</th>
              <th scope="col">Weight</th>
              <th scope="col">
                <span className="u-visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.key}>
                <th scope="row">
                  <label>
                    <span className="u-visually-hidden">Kind of interaction</span>
                    <select
                      value={contact.kind}
                      onChange={(event) =>
                        setContacts((current) =>
                          current.map((entry) =>
                            entry.key === contact.key ? { ...entry, kind: event.target.value } : entry,
                          ),
                        )
                      }
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>
                </th>
                <td>
                  <label>
                    <span className="u-visually-hidden">Days ago</span>
                    <input
                      type="number"
                      min={0}
                      max={900}
                      value={contact.days}
                      onChange={(event) =>
                        setContacts((current) =>
                          current.map((entry) =>
                            entry.key === contact.key
                              ? { ...entry, days: Number(event.target.value) }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                </td>
                <td className="docs-mono">{TIE_STRENGTH.kindWeights[contact.kind]?.toFixed(2)}</td>
                <td>
                  <button
                    className="docs-explainer__remove"
                    type="button"
                    onClick={() =>
                      setContacts((current) => current.filter((entry) => entry.key !== contact.key))
                    }
                  >
                    Remove
                    <span className="u-visually-hidden">
                      {' '}
                      the {contact.kind} from {contact.days} days ago
                    </span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          className="docs-button"
          type="button"
          onClick={() => {
            setContacts((current) => [...current, { key: next, kind: 'message', days: 7 }]);
            setNext((current) => current + 1);
          }}
        >
          Add an interaction
        </button>
      </div>

      <Readout
        rows={[
          ['Strength', <span className="docs-mono">{round(result.strength)}</span>],
          ['Status', result.status],
          [
            'From closeness',
            <span className="docs-mono">{round(result.factors.closeness)}</span>,
          ],
          [
            'From interactions',
            <span className="docs-mono">{round(result.factors.intensity)}</span>,
          ],
          ['Decayed intensity', <span className="docs-mono">{round(result.intensity)}</span>],
          [
            'Regularity multiplier',
            <span className="docs-mono">{round(result.regularityMultiplier)}</span>,
          ],
          ['Days with contact', <span className="docs-mono">{result.distinctContactDays}</span>],
          [
            'Days since the last one',
            <span className="docs-mono">{result.daysSinceLast ?? 'never'}</span>,
          ],
          [
            'Median gap',
            <span className="docs-mono">{result.medianGapDays ?? 'not enough contact'}</span>,
          ],
        ]}
      />

      <p className="docs-explainer__note">
        Intensity decays on a {TIE_STRENGTH.tauDays}-day time constant, so an interaction is worth
        about a third of its original weight after {TIE_STRENGTH.tauDays} days and very little after
        a year. That is why moving one contact further into the past changes the score more than
        adding a fourth recent one.
      </p>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function TextExplainer() {
  const [value, setValue] = useState('Running the database migrations for c++ and node.js');
  const fieldId = useId();

  const { normalized, tokens } = useMemo(() => {
    const norm = normalizeForMatch(value);
    return {
      normalized: norm,
      tokens: tokenize(value).map((token) => ({
        token,
        stopword: STOPWORDS.has(token),
        stemmed: stem(token),
      })),
    };
  }, [value]);

  return (
    <Figure
      title="What counts as a word"
      what={
        'This is the tokenizer the product searches with, and the one this documentation searches '
        + 'with. It keeps technical spellings intact on purpose: try node.js, c++ or a hyphenated '
        + 'name and watch them survive.'
      }
      source="packages/core/src/algorithms/text.ts"
    >
      <p className="docs-explainer__field docs-explainer__field--wide">
        <label htmlFor={fieldId}>Some text</label>
        <input
          id={fieldId}
          className="docs-search__field"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </p>

      <Readout
        rows={[['Normalised', <span className="docs-mono">{normalized || '(nothing)'}</span>]]}
      />

      <table className="docs-table docs-explainer__table">
        <caption>Tokens</caption>
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Stem</th>
            <th scope="col">Indexed</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map(({ token, stemmed, stopword }, position) => (
            <tr key={`${token}-${position}`}>
              <th scope="row" className="docs-mono">
                {token}
              </th>
              <td className="docs-mono">{stemmed}</td>
              <td>{stopword ? 'No, it is a stopword' : 'Yes'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tokens.length === 0 && <p className="docs-explainer__note">Nothing here is a word.</p>}
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// LaTeX escaping
// ---------------------------------------------------------------------------

function LatexExplainer() {
  // prose-gate: the sample is here to be escaped, so it carries what escaping is for
  const [value, setValue] = useState('Raised revenue 40% & cut costs ~$2M — see #3 {final}');
  const fieldId = useId();
  const escaped = useMemo(() => escapeLatex(value), [value]);
  const changed = escaped !== value;

  return (
    <Figure
      title="Making text safe to compile"
      what={
        'A résumé is compiled by a LaTeX engine, where a stray percent sign comments out the rest '
        + 'of the line and a stray backslash is a command. Everything a person types passes through '
        + 'this first. Type a brace, a dollar sign or a backslash and watch what happens to it.'
      }
      source="packages/core/src/algorithms/latex-escape.ts"
    >
      <p className="docs-explainer__field docs-explainer__field--wide">
        <label htmlFor={fieldId}>Text a person typed</label>
        <input
          id={fieldId}
          className="docs-search__field"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </p>

      <Readout
        rows={[
          ['What reaches the compiler', <code className="docs-mono">{escaped || '(nothing)'}</code>],
          ['Changed', changed ? 'Yes, at least one character was escaped' : 'No, nothing needed it'],
        ]}
      />
    </Figure>
  );
}

// ---------------------------------------------------------------------------

const EXPLAINERS: Record<string, () => React.ReactElement> = {
  'tie-strength': TieStrengthExplainer,
  text: TextExplainer,
  'latex-escape': LatexExplainer,
};

/** Is there an explainer for this algorithm? Used by the page renderer. */
export function hasDocsExplainer(id: string): boolean {
  return id in EXPLAINERS;
}

export function DocsExplainer({ id }: { id: string }) {
  const Explainer = EXPLAINERS[id];
  if (!Explainer) {
    // A page naming an explainer nobody wrote is a mistake, but not one worth
    // blanking the page for. Say which one, so it can be found and fixed.
    return (
      <p className="docs-explainer__missing">
        No interactive example is written for <span className="docs-mono">{id}</span>.
      </p>
    );
  }
  return <Explainer />;
}
