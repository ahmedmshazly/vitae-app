import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseCsv, parseCsvRecords } from './csv.js';

describe('parseCsv (RFC 4180)', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with commas, quotes, and newlines', () => {
    const text = 'name,notes\n"Chen, Sarah","She said ""hi""\nthen left"';
    expect(parseCsv(text)).toEqual([
      ['name', 'notes'],
      ['Chen, Sarah', 'She said "hi"\nthen left'],
    ]);
  });

  it('handles CRLF, trailing newline, and BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty cells', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('parseCsvRecords', () => {
  it('maps rows to records with tolerant headers', () => {
    const recs = parseCsvRecords('First Name,LAST-NAME,Email Address\nSarah,Chen,s@x.com');
    expect(recs).toEqual([{ first_name: 'Sarah', last_name: 'Chen', email_address: 's@x.com' }]);
  });

  it('skips blank lines and returns [] without data rows', () => {
    expect(parseCsvRecords('a,b\n\n')).toEqual([]);
  });
});

describe('normalizeHeader', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeHeader(' Connected On ')).toBe('connected_on');
    expect(normalizeHeader('E-mail 1 (Home)')).toBe('e_mail_1_home');
  });
});
