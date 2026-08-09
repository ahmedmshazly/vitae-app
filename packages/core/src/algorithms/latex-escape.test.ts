import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assertNoUnresolvedTokens,
  escapeInline,
  escapeLatex,
  escapeUrl,
  isSafeHref,
  renderInlineMarkdown,
} from './latex-escape.js';

describe('escapeLatex', () => {
  it('escapes every TeX metacharacter as literal text', () => {
    expect(escapeLatex('& % $ # _ { }')).toBe('\\& \\% \\$ \\# \\_ \\{ \\}');
  });

  it('neutralizes a shell-escape / injection attempt (SRS FR-RES-012)', () => {
    const evil = '\\write18{rm -rf /} & 100% $$';
    const out = escapeLatex(evil);
    expect(out).not.toContain('\\write18{');
    expect(out).toContain('\\textbackslash{}write18');
    expect(out).toContain('\\{rm -rf /\\}');
    expect(out).toContain('\\& 100\\% \\$\\$');
  });

  it('strips C0 control characters', () => {
    expect(escapeLatex(`a\u0000b\u0007c`)).toBe('abc');
  });

  it('handles typographic and TeX-sensitive punctuation explicitly', () => {
    expect(escapeLatex('a~b^c – — · •')).toBe(
      'a\\textasciitilde{}b\\textasciicircum{}c \\textendash{} \\textemdash{} \\textperiodcentered{} \\textbullet{}',
    );
  });
});

describe('escapeInline', () => {
  it('collapses newlines to a single space', () => {
    expect(escapeInline('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });
});

describe('escapeUrl', () => {
  it('escapes href targets without turning user input into LaTeX', () => {
    expect(escapeUrl('https://example.com/a b?q=x&tag=#one_{x}')).toBe(
      String.raw`https://example.com/a\%20b?q=x\&tag=\#one\_\%7Bx\%7D`,
    );
    expect(escapeUrl('mailto:a+b@example.com')).toBe('mailto:a+b@example.com');
  });

  it('strips controls and encodes braces/backslashes', () => {
    expect(escapeUrl(' https://x.test/a{b}\\c\u0000 ')).toBe(
      String.raw`https://x.test/a\%7Bb\%7D\%5Cc`,
    );
  });
});

describe('isSafeHref', () => {
  it('admits the schemes a résumé legitimately links with', () => {
    expect(isSafeHref('https://example.com/in/me')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:a@example.com')).toBe(true);
    expect(isSafeHref('tel:+201234567890')).toBe(true);
    expect(isSafeHref('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('admits schemeless values, which is what people type into a contact field', () => {
    expect(isSafeHref('example.com/in/me')).toBe(true);
    expect(isSafeHref('/relative/path')).toBe(true);
  });

  it('refuses schemes a PDF viewer could act on', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('  JavaScript:alert(1)  ')).toBe(false);
    expect(isSafeHref('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeHref('file:///etc/passwd')).toBe(false);
  });
});

describe('renderInlineMarkdown', () => {
  it('maps whitelisted bold/italic to \\textbf / \\textit', () => {
    expect(renderInlineMarkdown('**bold** and *italic*')).toBe(
      '\\textbf{bold} and \\textit{italic}',
    );
  });

  it('escapes content inside emphasis so it cannot inject', () => {
    expect(renderInlineMarkdown('**a & b**')).toBe('\\textbf{a \\& b}');
  });

  it('treats a lone marker as literal', () => {
    expect(renderInlineMarkdown('50% * savings')).toContain('50\\%');
  });
});

describe('assertNoUnresolvedTokens', () => {
  it('throws when a «token» is left unresolved', () => {
    expect(() => assertNoUnresolvedTokens('hello «NAME»')).toThrow(/Unresolved/);
  });
  it('passes clean output', () => {
    expect(() => assertNoUnresolvedTokens('all resolved')).not.toThrow();
  });
});

describe('property: escaping is always safe and compiles (SRS FR-RES-012 fuzz)', () => {
  const isSafe = (out: string): boolean => {
    const stripped = out
      .replace(/\\textbackslash\{\}/g, '')
      .replace(/\\textasciitilde\{\}/g, '')
      .replace(/\\textasciicircum\{\}/g, '')
      .replace(/\\textendash\{\}/g, '')
      .replace(/\\textemdash\{\}/g, '')
      .replace(/\\textperiodcentered\{\}/g, '')
      .replace(/\\textbullet\{\}/g, '')
      .replace(/\\[&%$#_{}]/g, '');
    return !/[&%$#_~^\\{}]/.test(stripped);
  };

  it('escapeLatex output is always safe', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => isSafe(escapeLatex(s))),
      { numRuns: 2000 },
    );
  });

  it('escapeLatex remains safe when escaped again', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => isSafe(escapeLatex(escapeLatex(s)))),
      { numRuns: 1000 },
    );
  });

  it('renderInlineMarkdown only emits whitelisted control sequences', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => {
        const controlSeqs = renderInlineMarkdown(s).match(/\\[a-zA-Z]+/g) ?? [];
        return controlSeqs.every((control) =>
          [
            '\\textbf',
            '\\textit',
            '\\textbackslash',
            '\\textasciitilde',
            '\\textasciicircum',
            '\\textendash',
            '\\textemdash',
            '\\textperiodcentered',
            '\\textbullet',
          ].includes(control),
        );
      }),
      { numRuns: 1500 },
    );
  });
});
