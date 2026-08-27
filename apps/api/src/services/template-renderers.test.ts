/**
 * Letter rendering (FR-RES-021) and the calibration contract every shipped
 * template owes the image build (FR-RES-009).
 *
 * The second half is here on purpose. calibrate.ts enforces the same contract,
 * but it only runs inside `docker build`, where a missing sample token shows up
 * as a failed image long after the commit that caused it. These assertions fail
 * in a normal test run instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { letterParagraphs, letterTokens, type LetterRenderModel } from './template-renderers.js';

const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../templates');
const KINDS = new Set(['resume', 'letter', 'dossier']);
const TOKEN_RE = /«([A-Z_]+)»/g;

function tokensIn(tex: string): string[] {
  return [...new Set([...tex.matchAll(TOKEN_RE)].map((match) => match[1]!))];
}

function splice(tex: string, tokens: Record<string, string>): string {
  return tex.replace(TOKEN_RE, (whole, name: string) => tokens[name] ?? whole);
}

function model(over: Partial<LetterRenderModel> = {}): LetterRenderModel {
  return {
    senderName: 'Amara Diallo',
    senderContacts: [
      { key: 'city', value: 'Kigali, Rwanda' },
      { key: 'email', value: 'a@example.com', href: 'mailto:a@example.com' },
    ],
    dateLine: '26 August 2026',
    recipient: { org: 'Nile Robotics' },
    subject: 'Senior Engineer',
    salutation: 'Dear Hiring Team,',
    paragraphs: ['I am writing about the role.'],
    closing: 'Sincerely,',
    accent: '#2563eb',
    ...over,
  };
}

describe('letterParagraphs', () => {
  it('keeps the words apart across a line break inside a paragraph', () => {
    // escapeLatex strips control characters, and a newline is one, so a
    // paragraph escaped with its breaks intact came back welded together.
    expect(letterParagraphs('first line\nsecond line')).toEqual(['first line second line']);
  });

  it('splits on a blank line and drops the empty runs between', () => {
    expect(letterParagraphs('one\n\ntwo\n   \n\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('returns nothing for text that is only whitespace', () => {
    expect(letterParagraphs('   \n\n  ')).toEqual([]);
  });
});

describe('letterTokens', () => {
  it('escapes TeX metacharacters in every value it splices', () => {
    const tokens = letterTokens(
      model({
        senderName: 'A & B_100 {x}',
        salutation: 'Dear 100% Team,',
        paragraphs: ['Budget was $40 and #1 priority.'],
      }),
    );
    expect(tokens.SENDER_NAME).toBe('A \\& B\\_100 \\{x\\}');
    expect(tokens.SIGNATURE_NAME).toBe(tokens.SENDER_NAME);
    expect(tokens.SALUTATION).toBe('Dear 100\\% Team,');
    expect(tokens.BODY_BLOCKS).toBe('Budget was \\$40 and \\#1 priority.');
  });

  it('renders the whitelisted mini-markdown the résumé bullets use', () => {
    const tokens = letterTokens(model({ paragraphs: ['**bold** and *italic*'] }));
    expect(tokens.BODY_BLOCKS).toBe('\\textbf{bold} and \\textit{italic}');
  });

  it('separates paragraphs with a blank line so TeX starts a new one', () => {
    const tokens = letterTokens(model({ paragraphs: ['one', 'two'] }));
    expect(tokens.BODY_BLOCKS).toBe('one\n\ntwo');
  });

  it('breaks the recipient lines without leaving a break at the end', () => {
    const tokens = letterTokens(
      model({ recipient: { name: 'Amara Diallo', org: 'Nile Robotics' }, subject: 'Staff Engineer' }),
    );
    // A trailing \\ would end the paragraph with nothing after it, which is a
    // TeX error rather than a layout quirk.
    expect(tokens.RECIPIENT_BLOCK).toBe('Amara Diallo\\\\\nNile Robotics\\\\\nRe: Staff Engineer');
    expect(tokens.RECIPIENT_BLOCK.endsWith('\\\\')).toBe(false);
  });

  it('leaves the recipient block empty when the letter records no addressee', () => {
    const tokens = letterTokens(model({ recipient: {}, subject: undefined }));
    expect(tokens.RECIPIENT_BLOCK).toBe('');
  });

  it('links a safe contact and prints an unsafe scheme as plain text', () => {
    const tokens = letterTokens(
      model({
        senderContacts: [
          { key: 'email', value: 'a@example.com', href: 'mailto:a@example.com' },
          { key: 'site', value: 'example.com', href: 'javascript:alert(1)' },
        ],
      }),
    );
    expect(tokens.SENDER_CONTACT_BLOCK).toContain('\\href{mailto:a@example.com}{a@example.com}');
    expect(tokens.SENDER_CONTACT_BLOCK).not.toContain('javascript:');
  });

  it('drops a contact the profile has switched off', () => {
    const tokens = letterTokens(
      model({
        senderContacts: [
          { key: 'city', value: 'Kigali, Rwanda' },
          { key: 'phone', value: '+250780000000', disabled: true },
        ],
      }),
    );
    expect(tokens.SENDER_CONTACT_BLOCK).toBe('Kigali, Rwanda');
  });

  it('hands the accent to LaTeX as a bare uppercase hex triplet', () => {
    expect(letterTokens(model({ accent: '#0f766e' })).ACCENT_HEX).toBe('0F766E');
  });
});

describe('the letter template and its renderer agree', () => {
  it('fills every token letter-classic declares', () => {
    const tex = readFileSync(join(TEMPLATES_DIR, 'letter-classic', 'main.tex'), 'utf8');
    const spliced = splice(tex, letterTokens(model()));
    expect(spliced.match(/«[^»]*»/)).toBeNull();
  });
});

describe('every shipped template carries its own calibration fixture', () => {
  const keys = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('finds at least the résumé layouts and the letter layout', () => {
    expect(keys).toEqual(expect.arrayContaining(['argon', 'cobalt', 'letter-classic', 'onyx']));
  });

  it.each(keys)('%s declares a kind, a page expectation and a line-model switch', (key) => {
    const config = JSON.parse(readFileSync(join(TEMPLATES_DIR, key, 'calibration.json'), 'utf8'));
    expect(KINDS.has(config.kind)).toBe(true);
    const pages = config.expected_pages;
    if (typeof pages === 'number') expect(pages).toBeGreaterThanOrEqual(1);
    else expect(pages.max).toBeGreaterThanOrEqual(pages.min);
    expect(typeof config.line_model.check).toBe('boolean');
  });

  it.each(keys)('%s has a sample for every token its main.tex uses', (key) => {
    const tex = readFileSync(join(TEMPLATES_DIR, key, 'main.tex'), 'utf8');
    const config = JSON.parse(readFileSync(join(TEMPLATES_DIR, key, 'calibration.json'), 'utf8'));
    const missing = tokensIn(tex).filter((token) => !(token in config.tokens));
    expect(missing).toEqual([]);
    expect(splice(tex, config.tokens).match(/«[^»]*»/)).toBeNull();
  });
});
