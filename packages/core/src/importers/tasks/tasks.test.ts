import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { identityKey } from '../../schema/envelope.js';
import { parseCivilDate } from './date.js';
import { parseAsana } from './asana.js';
import { parseNotion } from './notion.js';
import { parseTasksCsv } from './csv.js';
import { parseTasksJson } from './json.js';
import { parseTasksText } from './text.js';
import { parseThings } from './things.js';
import { parseTickTick } from './ticktick.js';
import { parseTodoist } from './todoist.js';
import { parseTrello } from './trello.js';
import { DEFAULT_TASK_IMPORT_CONTEXT, isFatalTaskImport, type TaskImportContext } from './types.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const load = (name: string): string => readFileSync(join(fixtures, name), 'utf8');
const CTX: TaskImportContext = DEFAULT_TASK_IMPORT_CONTEXT;

describe('parseCivilDate timezone conversion', () => {
  it('keeps a date-only cell as the civil day the file wrote', () => {
    expect(parseCivilDate('2026-04-18', { ...CTX, timezone: 'America/New_York' })).toBe('2026-04-18');
    expect(parseCivilDate('2026-04-18', { ...CTX, timezone: 'UTC' })).toBe('2026-04-18');
  });

  it('converts an instant to the workspace civil day (NY vs UTC)', () => {
    const instant = '2026-04-18T03:00:00.000Z';
    expect(parseCivilDate(instant, { ...CTX, timezone: 'UTC' })).toBe('2026-04-18');
    expect(parseCivilDate(instant, { ...CTX, timezone: 'America/New_York' })).toBe('2026-04-17');
  });
});

describe('parseTodoist', () => {
  it('reads the golden project CSV into Vitae drafts', () => {
    const result = parseTodoist(load('todoist.csv'), CTX);
    expect(result.tasks.map((task) => task.title)).toEqual([
      'Renew passport',
      'Call the embassy',
      'Buy milk @errand',
    ]);
    const passport = result.tasks[0]!;
    expect(passport.props.priority).toBe('p1');
    expect(passport.props.effort_min).toBe(30);
    expect(passport.props.due).toBe('2026-04-18');
    expect(passport.props.target).toBe('2026-04-16');
    expect(passport.notes_md).toBe('Bring photos');
    expect(passport.identity_key).toBeNull();

    const embassy = result.tasks[1]!;
    expect(embassy.parent_source_id).toBe(passport.source_id);
    expect(embassy.props.due).toBeUndefined();
    expect(embassy.props.target).toBe('2026-01-15');
    expect(embassy.notes_md).toContain('Line one\nline two');
    expect(embassy.notes_md).toContain('A comment on the call');

    const milk = result.tasks[2]!;
    expect(milk.props.priority).toBe('p4');
    expect(milk.props.recurrence).toEqual({
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      mode: 'fixed',
      exceptions: [],
    });
    expect(result.skipped.map((row) => row.reason)).toEqual(['section', 'missing_title']);
  });

  it('refuses a CSV that is not the Todoist template', () => {
    const result = parseTodoist('title,notes\nA,B\n', CTX);
    expect(result.tasks).toEqual([]);
    expect(isFatalTaskImport(result)).toBe(true);
    expect(result.skipped[0]?.reason).toBe('unrecognized_format');
  });
});

describe('parseThings', () => {
  it('reads the documented JSON array', () => {
    const result = parseThings(load('things.json'), CTX);
    expect(result.projects.map((project) => project.title)).toEqual(['Go Shopping', 'Work']);
    expect(result.tasks.find((task) => task.title === 'Bread')?.project_name).toBe('Go Shopping');
    const milk = result.tasks.find((task) => task.title === 'Milk');
    expect(milk?.props.due).toBe('2026-09-11');
    expect(milk?.props.target).toBe('2026-09-04');
    const report = result.tasks.find((task) => task.title === 'Submit report');
    expect(report?.props.status).toBe('done');
    expect(report?.project_name).toBe('Work');
    expect(result.skipped.some((row) => row.reason === 'heading')).toBe(true);
    expect(result.skipped.some((row) => row.reason === 'unsupported_status')).toBe(true);
    const someday = result.tasks.find((task) => task.title === 'Someday idea');
    expect(someday?.props.status).toBeUndefined();
  });

  it('names a SQLite export rather than guessing a schema', () => {
    const result = parseThings('SQLite format 3\0main', CTX);
    expect(isFatalTaskImport(result)).toBe(true);
    expect(result.skipped[0]?.reason).toBe('sqlite_export');
  });
});

describe('parseTickTick', () => {
  it('skips the preamble and keys tasks by taskId', () => {
    const result = parseTickTick(load('ticktick.csv'), CTX);
    expect(result.projects.map((project) => project.title)).toEqual(['Admin']);
    const passport = result.tasks[0]!;
    expect(passport.source_id).toBe('t1');
    expect(passport.identity_key).toBe('ticktick:task:t1');
    expect(identityKey.safeParse(passport.identity_key).success).toBe(true);
    expect(passport.props.priority).toBe('p1');
    expect(passport.props.due).toBe('2026-09-11');
    expect(passport.props.target).toBe('2026-09-01');
    expect(passport.props.scheduled).toBeUndefined();
    expect(passport.props.recurrence?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    const child = result.tasks.find((task) => task.source_id === 't2');
    expect(child?.parent_source_id).toBe('t1');
    expect(child?.title).toBe('A task, with a comma');
  });

  it('skips a NOTE row instead of writing it as a task', () => {
    const result = parseTickTick(
      [
        'Folder Name,List Name,Title,Kind,taskId',
        'Home,Admin,A real task,TEXT,t1',
        'Home,Admin,Shopping list,NOTE,n1',
      ].join('\n'),
      CTX,
    );
    expect(result.tasks.map((task) => task.title)).toEqual(['A real task']);
    expect(result.skipped.some((row) => row.reason === 'unsupported_type' && row.token === 'NOTE')).toBe(
      true,
    );
  });
});

describe('parseTrello', () => {
  it('turns the board into a project and cards into tasks', () => {
    const result = parseTrello(load('trello.json'), CTX);
    expect(result.projects[0]).toMatchObject({
      title: 'Move house',
      identity_key: 'project:trello:board1',
    });
    const passport = result.tasks.find((task) => task.source_id === 'card1');
    expect(passport?.props.due).toBe('2026-09-11');
    expect(passport?.notes_md).toContain('Bring photos');
    expect(passport?.identity_key).toBe('trello:card:card1');
    const children = result.tasks.filter((task) => task.parent_source_id === 'card1');
    expect(children.map((task) => task.title)).toEqual(['Photo', 'Form']);
    expect(result.tasks.find((task) => task.source_id === 'card3')?.props.status).toBe('dropped');
  });

  it('names JSON that is not a board export', () => {
    expect(parseTrello('{', CTX).skipped[0]?.reason).toBe('unparseable_json');
    expect(parseTrello('{"id":"x"}', CTX).skipped[0]?.reason).toBe('unrecognized_format');
  });
});

describe('parseAsana', () => {
  it('resolves a parent by name and records an assignee skip', () => {
    const result = parseAsana(load('asana.csv'), CTX);
    const passport = result.tasks.find((task) => task.source_id === '123');
    expect(passport?.identity_key).toBe('asana:task:123');
    expect(passport?.props.due).toBe('2026-09-11');
    expect(passport?.props.target).toBe('2026-09-01');
    expect(passport?.props.scheduled).toBeUndefined();
    expect(result.skipped.some((row) => row.reason === 'assignee')).toBe(true);
    const kitchen = result.tasks.find((task) => task.source_id === '125');
    expect(kitchen?.parent_source_id).toBe('123');
  });

  it('skips an unparseable due and resolves a blocker by title', () => {
    const result = parseAsana(
      [
        'Name,Task ID,Due Date,Blocked By (Dependencies)',
        'Lead,1,,',
        'Follow,2,not-a-day,Lead',
      ].join('\n'),
      CTX,
    );
    expect(result.skipped.some((row) => row.reason === 'unparseable_date')).toBe(true);
    expect(result.tasks.find((task) => task.source_id === '2')?.blocked_by_source_ids).toEqual(['1']);
  });
});

describe('parseNotion', () => {
  it('maps Name / Status / Due / Priority / Project', () => {
    const result = parseNotion(load('notion.csv'), CTX);
    const passport = result.tasks.find((task) => task.title === 'Renew passport');
    expect(passport?.props.status).toBe('done');
    expect(passport?.props.priority).toBe('p1');
    expect(passport?.props.due).toBe('2026-09-11');
    expect(passport?.project_name).toBe('Admin');
    expect(passport?.identity_key).toBeNull();
  });

  it('names a markdown page and a CSV with no title column', () => {
    expect(parseNotion('# A page\n\nNot a database.\n', CTX).skipped[0]?.reason).toBe(
      'unrecognized_format',
    );
    expect(parseNotion('Status,Due\nDone,2026-09-11\n', CTX).skipped[0]?.reason).toBe(
      'missing_title_column',
    );
  });
});

describe('parseTasksJson', () => {
  it('reads a vitae.tasks document and keeps sensitive classification', () => {
    const result = parseTasksJson(
      JSON.stringify({
        format: 'vitae.tasks',
        version: 1,
        projects: [{ id: 'p1', title: 'Admin' }],
        tasks: [
          {
            id: 't1',
            title: 'Renew passport',
            status: 'next',
            due: '2026-09-11',
            target: '2026-09-01',
            priority: 'p1',
            importance: 'important',
            sensitive: true,
            project_id: 'p1',
            parent_id: 't0',
            blocked_by: ['t2'],
            recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=MO', mode: 'fixed' },
          },
        ],
      }),
      CTX,
    );
    expect(result.projects[0]?.identity_key).toBe('project:tasks_json:p1');
    const task = result.tasks[0]!;
    expect(task.identity_key).toBe('tasks_json:task:t1');
    expect(task.sensitivity).toBe('sensitive');
    expect(task.props.status).toBe('next');
    expect(task.props.due).toBe('2026-09-11');
    expect(task.props.target).toBe('2026-09-01');
    expect(task.blocked_by_source_ids).toEqual(['t2']);
  });

  it('maps fourfold.transfer items to tasks and projects', () => {
    const result = parseTasksJson(
      JSON.stringify({
        format: 'fourfold.transfer',
        version: 1,
        projects: [{ source_id: 'p1', fields: { name: 'Admin', private: true } }],
        items: [
          {
            source_id: 'i1',
            project_source_id: 'p1',
            fields: { title: 'Renew passport', status: 'open', priority: 'P1', due_at: '2026-09-11' },
          },
        ],
      }),
      CTX,
    );
    expect(result.projects[0]?.sensitivity).toBe('sensitive');
    expect(result.tasks[0]?.props.status).toBe('inbox');
    expect(result.tasks[0]?.props.priority).toBe('p1');
    expect(result.tasks[0]?.identity_key).toBe('tasks_json:task:i1');
  });

  it('does not invent a recurrence or an importance the file never stated', () => {
    const result = parseTasksJson(
      JSON.stringify({
        format: 'vitae.tasks',
        version: 1,
        projects: [],
        tasks: [
          {
            id: 't1',
            title: 'Mystery',
            due: '2026-09-11',
            recurrence: { rrule: 'every other fortnight-ish' },
          },
        ],
      }),
      CTX,
    );
    expect(result.tasks[0]?.props.importance).toBeUndefined();
    expect(result.tasks[0]?.props.recurrence).toBeUndefined();
    expect(result.skipped.some((row) => row.reason === 'unsupported_recurrence')).toBe(true);
  });

  it('names invalid JSON and an unrecognized dialect', () => {
    expect(parseTasksJson('{', CTX).skipped[0]?.reason).toBe('unparseable_json');
    expect(parseTasksJson('{"items":[]}', CTX).skipped[0]?.reason).toBe('unrecognized_format');
    expect(isFatalTaskImport(parseTasksJson('{"items":[]}', CTX))).toBe(true);
  });
});

describe('parseTasksCsv', () => {
  it('round-trips our own headers, including quoted commas', () => {
    const result = parseTasksCsv(load('csv-quoted.csv'), CTX);
    expect(result.projects[0]?.title).toBe('Move house');
    expect(result.tasks.map((task) => task.title)).toEqual(['Hello, world', 'Pack kitchen']);
    expect(result.tasks[1]).toMatchObject({ source_id: 'i2', parent_source_id: 'i1' });
    expect(result.tasks[0]?.identity_key).toBe('tasks_csv:task:i1');
  });

  it('refuses a file with no title column and names a malformed quote', () => {
    expect(parseTasksCsv(load('csv-unmapped.csv'), CTX).skipped[0]?.reason).toBe(
      'missing_title_column',
    );
    expect(parseTasksCsv('title\n"no end\n', CTX, { title: 'title' }).skipped[0]?.reason).toBe(
      'malformed_csv',
    );
  });
});

describe('parseTasksText', () => {
  it('reads the capture-style golden list', () => {
    const result = parseTasksText(load('plain-text.txt'), CTX);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      title: 'Renew passport',
      project_name: 'admin',
      props: {
        priority: 'p1',
        due: '2026-09-11',
        effort_min: 30,
        energy: 'low',
        recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=MO', mode: 'fixed', exceptions: [] },
      },
    });
    expect(result.tasks[0]?.identity_key).toBeNull();
    expect(result.skipped.map((row) => row.reason)).toEqual(['empty', 'missing_title']);
  });

  it('never keys a row from its title', () => {
    const result = parseTasksText('Buy milk\n', CTX);
    expect(result.tasks[0]?.title).toBe('Buy milk');
    expect(result.tasks[0]?.identity_key).toBeNull();
  });
});
