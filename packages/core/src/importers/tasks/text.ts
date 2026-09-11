/**
 * Plain-text import: one task per line. Tokens the capture bar already
 * understands (`!p1`, `#project`) plus the Fourfold line extras (`due fri`,
 * `every monday`, `~30m`, `energy low`). A line with no title is skipped.
 */

import { parseDateToken } from '../../algorithms/capture-grammar.js';
import { parseCivilDate } from './date.js';
import { taskDraft } from './drafts.js';
import { everyPhraseToRRule, parseEnergy, parseVitaePriority, recurrenceFromRule } from './fields.js';
import { skip, splitLines } from './skip.js';
import type { StatedTaskProps, TaskFileDraft, TaskImportContext, TaskImportResult, TaskImportSkip } from './types.js';

export function parseTasksText(input: string, ctx: TaskImportContext): TaskImportResult {
  const tasks: TaskFileDraft[] = [];
  const skipped: TaskImportSkip[] = [];

  for (const [index, line] of splitLines(input).entries()) {
    const at = String(index + 1);
    if (line.trim() === '') {
      skipped.push(skip('line', at, 'empty'));
      continue;
    }

    const parsed = parseLine(line, ctx);
    if (parsed.title === '') {
      skipped.push(skip('line', at, 'missing_title', line.trim()));
      continue;
    }
    skipped.push(...parsed.skipped.map((reason) => skip('line', at, reason.reason, reason.token)));
    tasks.push(
      taskDraft({
        title: parsed.title,
        props: parsed.props,
        ...(parsed.project !== undefined ? { project_name: parsed.project } : {}),
      }),
    );
  }

  return { tasks, projects: [], skipped };
}

function parseLine(
  line: string,
  ctx: TaskImportContext,
): {
  title: string;
  props: StatedTaskProps;
  project?: string;
  skipped: Array<{ reason: 'unsupported_recurrence'; token: string }>;
} {
  const words = line.trim().split(/\s+/);
  const titleWords: string[] = [];
  const props: Record<string, unknown> = {};
  let project: string | undefined;
  const skipped: Array<{ reason: 'unsupported_recurrence'; token: string }> = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word.startsWith('#') && word.length > 1) {
      project = word.slice(1);
      continue;
    }
    if (word.startsWith('!') && word.length > 1) {
      const priority = parseVitaePriority(word.slice(1));
      if (priority !== undefined) props.priority = priority;
      continue;
    }
    if (word.toLowerCase() === 'due' && words[i + 1] !== undefined) {
      const token = words[++i]!;
      const fromCapture = parseDateToken(token.toLowerCase(), ctx.now);
      const day = fromCapture?.iso ?? parseCivilDate(token, ctx);
      if (day !== null) props.due = day;
      continue;
    }
    if (word.toLowerCase() === 'every') {
      const phraseWords = ['every'];
      while (i + 1 < words.length && !isReserved(words[i + 1]!)) {
        phraseWords.push(words[++i]!);
      }
      const phrase = phraseWords.join(' ');
      const rrule = everyPhraseToRRule(phrase, ctx);
      const recurrence = rrule === null ? recurrenceFromRule(phrase) : recurrenceFromRule(rrule);
      if (recurrence === null) skipped.push({ reason: 'unsupported_recurrence', token: phrase });
      else props.recurrence = recurrence;
      continue;
    }
    if (word.toLowerCase() === 'energy' && words[i + 1] !== undefined) {
      const energy = parseEnergy(words[++i]!);
      if (energy !== undefined) props.energy = energy;
      continue;
    }
    const duration = /^~(\d+)m(?:in(?:ute)?s?)?$/i.exec(word);
    if (duration) {
      props.effort_min = Number(duration[1]);
      continue;
    }
    titleWords.push(word);
  }

  return {
    title: titleWords.join(' ').trim(),
    props: props as StatedTaskProps,
    ...(project !== undefined ? { project } : {}),
    skipped,
  };
}

function isReserved(word: string): boolean {
  const lower = word.toLowerCase();
  return (
    word.startsWith('#') ||
    word.startsWith('!') ||
    word.startsWith('~') ||
    lower === 'due' ||
    lower === 'every' ||
    lower === 'energy'
  );
}
