/**
 * RFC 4180 reader that names the line of an unclosed quote instead of
 * guessing extra cells. TickTick (and some Notion exports) write metadata
 * above the table; `sliceFromHeaderRow` cuts to the real header.
 */

export interface CsvRow {
  readonly line: number;
  readonly cells: readonly string[];
  readonly fields: Readonly<Record<string, string>>;
}

export interface CsvTable {
  readonly ok: true;
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
}

export interface CsvReadError {
  readonly ok: false;
  readonly reason: 'malformed_csv';
  readonly line: number;
  readonly token: '"';
}

export type CsvReadResult = CsvTable | CsvReadError;

interface RecordDraft {
  readonly cells: readonly string[];
  readonly line: number;
}

export function readCsv(input: string): CsvReadResult {
  const parsed = parseRecords(input);
  if (!parsed.ok) return parsed;

  const headerRecord = parsed.records[0];
  if (headerRecord === undefined) return { ok: true, headers: [], rows: [] };

  const headers = headerRecord.cells;
  const rows = parsed.records.slice(1).map((record) => {
    const fields: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      fields[header] = record.cells[index] ?? '';
    }
    return { line: record.line, cells: record.cells, fields };
  });

  return { ok: true, headers, rows };
}

function parseRecords(
  input: string,
): { readonly ok: true; readonly records: readonly RecordDraft[] } | CsvReadError {
  let offset = input.startsWith('\uFEFF') ? 1 : 0;
  if (offset >= input.length) return { ok: true, records: [] };

  const records: RecordDraft[] = [];
  let cells: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;

  const pushRecord = (): void => {
    cells.push(field);
    field = '';
    records.push({ cells, line: recordLine });
    cells = [];
  };

  while (offset < input.length) {
    const ch = input[offset];
    if (ch === undefined) break;

    if (inQuotes) {
      if (ch === '"') {
        if (input[offset + 1] === '"') {
          field += '"';
          offset += 2;
          continue;
        }
        inQuotes = false;
        offset += 1;
        continue;
      }
      const ended = consumeLineEnding(input, offset);
      if (ended !== null) {
        field += '\n';
        line += 1;
        offset = ended;
        continue;
      }
      field += ch;
      offset += 1;
      continue;
    }

    if (ch === '"') {
      if (field === '') {
        inQuotes = true;
        offset += 1;
        continue;
      }
      field += ch;
      offset += 1;
      continue;
    }

    if (ch === ',') {
      cells.push(field);
      field = '';
      offset += 1;
      continue;
    }

    const ended = consumeLineEnding(input, offset);
    if (ended !== null) {
      pushRecord();
      line += 1;
      recordLine = line;
      offset = ended;
      continue;
    }

    field += ch;
    offset += 1;
  }

  if (inQuotes) return { ok: false, reason: 'malformed_csv', line: recordLine, token: '"' };
  if (field.length > 0 || cells.length > 0) pushRecord();
  return { ok: true, records };
}

function consumeLineEnding(input: string, offset: number): number | null {
  const ch = input[offset];
  if (ch === '\r' && input[offset + 1] === '\n') return offset + 2;
  if (ch === '\n' || ch === '\r') return offset + 1;
  return null;
}

export function sliceFromHeaderRow(input: string, required: readonly string[]): string | null {
  const first = required[0];
  if (first === undefined) return null;

  const lower = input.toLowerCase();
  const needle = first.toLowerCase();
  let from = 0;

  while (from < input.length) {
    const idx = lower.indexOf(needle, from);
    if (idx === -1) return null;
    const lineStart = input.lastIndexOf('\n', idx) + 1;
    const lineEnd = input.indexOf('\n', idx);
    const line = input.slice(lineStart, lineEnd === -1 ? input.length : lineEnd);
    const lineLower = line.toLowerCase();
    if (required.every((name) => lineLower.includes(name.toLowerCase()))) {
      return input.slice(lineStart);
    }
    from = idx + needle.length;
  }
  return null;
}

export function cell(fields: Readonly<Record<string, string>>, header: string | undefined): string {
  if (header === undefined || header === '') return '';
  const exact = fields[header];
  if (exact !== undefined) return exact;
  const wanted = header.toLowerCase();
  for (const [name, value] of Object.entries(fields)) {
    if (name.toLowerCase() === wanted) return value;
  }
  return '';
}

export function hasHeaders(headers: readonly string[], required: readonly string[]): boolean {
  const have = new Set(headers.map((header) => header.toLowerCase()));
  return required.every((header) => have.has(header.toLowerCase()));
}

export function headerAlias(headers: readonly string[], aliases: readonly string[]): string | undefined {
  const have = new Map(headers.map((header) => [header.toLowerCase(), header]));
  for (const alias of aliases) {
    const found = have.get(alias.toLowerCase());
    if (found !== undefined) return found;
  }
  return undefined;
}
