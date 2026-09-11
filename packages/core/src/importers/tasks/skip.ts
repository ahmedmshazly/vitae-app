import type { TaskImportSkip, TaskImportSkipReason } from './types.js';

export function skip(
  kind: TaskImportSkip['at']['kind'],
  value: string,
  reason: TaskImportSkipReason,
  token?: string,
): TaskImportSkip {
  return token === undefined
    ? { at: { kind, value }, reason }
    : { at: { kind, value }, reason, token };
}

/** Split on LF / CR / CRLF and drop the empty slot a trailing newline adds. */
export function splitLines(input: string): string[] {
  const lines = input.split(/\r?\n|\r/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}
