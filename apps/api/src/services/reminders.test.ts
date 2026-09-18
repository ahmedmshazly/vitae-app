import { afterEach, describe, expect, it, vi } from 'vitest';
import { repository } from '../db/repository.js';
import { runInTimezone } from '../db/timezone.js';
import { openReminders } from './reminders.js';

vi.mock('../db/repository.js', () => ({ repository: { docQuery: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('openReminders', () => {
  it('resumes only expired snoozes and sorts them with open reminders', async () => {
    const snoozed = [
      { id: 'today', status: 'snoozed', due_on: '2026-09-14', snoozed_until: '2026-09-14' },
      { id: 'later', status: 'snoozed', due_on: '2026-09-15', snoozed_until: '2026-09-15' },
      { id: 'past', status: 'snoozed', due_on: '2026-09-12', snoozed_until: '2026-09-12' },
      { id: 'undated', status: 'snoozed', due_on: '2026-09-12' },
    ];
    vi.mocked(repository.docQuery).mockImplementation(async (_table, filter) =>
      filter?.status === 'open' ? [{ id: 'open', status: 'open', due_on: '2026-09-13' }] : snoozed,
    );
    const result = await openReminders('2026-09-14');
    expect(result.map((reminder) => reminder.id)).toEqual(['past', 'open', 'today']);
    expect(result.every((reminder) => reminder.status === 'open')).toBe(true);
    expect(snoozed[0].status).toBe('snoozed');
    expect(repository.docQuery).toHaveBeenCalledWith('reminders', { status: 'open' });
    expect(repository.docQuery).toHaveBeenCalledWith('reminders', { status: 'snoozed' });
  });

  it('resumes on the user’s calendar date rather than UTC midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-13T22:30:00Z'));
    vi.mocked(repository.docQuery).mockImplementation(async (_table, filter) => filter?.status === 'open' ? [] : [
      { id: 'due', status: 'snoozed', due_on: '2026-09-14', snoozed_until: '2026-09-14' },
    ]);
    expect(await runInTimezone('Africa/Cairo', () => openReminders())).toHaveLength(1);
    expect(await runInTimezone('America/Los_Angeles', () => openReminders())).toHaveLength(0);
  });

  it('does not present a partial result as an empty or complete list', async () => {
    vi.mocked(repository.docQuery).mockRejectedValueOnce(new Error('Database unavailable'));
    vi.mocked(repository.docQuery).mockResolvedValueOnce([]);
    await expect(openReminders()).rejects.toThrow('Database unavailable');
  });
});
