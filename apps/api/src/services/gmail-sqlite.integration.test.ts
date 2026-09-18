import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repository } from '../db/repository.js';
import { importGmailSqlite } from './gmail-sqlite.js';

describe('local Gmail knowledge adapter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-gmail-test-'));
  const path = join(dir, 'gmail.sqlite');
  const suffix = `${Date.now()}@example.test`;
  let personId: string;

  beforeAll(async () => {
    const sqlite = new DatabaseSync(path);
    sqlite.exec(`CREATE TABLE messages (
      id TEXT PRIMARY KEY, thread_id TEXT, subject TEXT, sent_at TEXT,
      from_address TEXT, to_addresses TEXT, body_text TEXT, labels TEXT
    )`);
    const insert = sqlite.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run(
      'human-1',
      'thread-1',
      'Contact details',
      '2025-04-05T10:00:00Z',
      `Nora Example <${suffix}>`,
      'Owner <owner@example.test>',
      'I am based in Cairo. My phone number is +20 100 555 0199.',
      '',
    );
    insert.run(
      'automated-1',
      'thread-2',
      'Please finish an old task',
      '2021-01-01T10:00:00Z',
      'no-reply@service.example',
      'owner@example.test',
      'Please submit this request. Do not reply.',
      'notification',
    );
    sqlite.close();
    const person = await repository.createNode(
      { type: 'person', title: 'Nora Example', props: { emails: [suffix], phones: [] } },
      { actor: 'test' },
    );
    personId = person.id;
  });

  afterAll(async () => {
    if (personId) await repository.purgeNodes([personId]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('enriches an exact identity, excludes automation, and remains idempotent', async () => {
    const tasksBefore = (await repository.allLiveNodes()).filter(
      (node) => node.type === 'task',
    ).length;
    const first = await importGmailSqlite({ path, selfAddresses: ['owner@example.test'] });
    expect(first).toMatchObject({ records: 2, assertions: 3, automaticallyApplied: 2, pending: 0 });

    const person = await repository.getNode(personId);
    expect(person?.props).toMatchObject({ city: 'Cairo', phones: ['+20 100 555 0199'] });
    const tasksAfter = (await repository.allLiveNodes()).filter(
      (node) => node.type === 'task',
    ).length;
    expect(tasksAfter).toBe(tasksBefore);

    const records = (await repository.docList<Record<string, unknown>>('source_records')).filter(
      (record) => record.source_id === first.source.id,
    );
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain('My phone number');
    expect(JSON.stringify(records)).not.toContain('Please submit this request');

    const second = await importGmailSqlite({ path, selfAddresses: ['owner@example.test'] });
    expect(second.records).toBe(2);
    expect(
      (await repository.docList<Record<string, unknown>>('source_records')).filter(
        (record) => record.source_id === first.source.id,
      ),
    ).toHaveLength(2);
  });
});
