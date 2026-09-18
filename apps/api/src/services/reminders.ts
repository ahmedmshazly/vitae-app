import { repository } from '../db/repository.js';
import { todayIso } from '../db/timezone.js';

/**
 * Snooze is a dated pause, not a terminal status. Resolve expired pauses on
 * read so both the drawer and Today recover them without a scheduler or a
 * GET-side write that could race with Done or a second snooze.
 */
export async function openReminders(today = todayIso()): Promise<Array<Record<string, unknown>>> {
  const [open, snoozed] = await Promise.all([
    repository.docQuery<Record<string, unknown>>('reminders', { status: 'open' }),
    repository.docQuery<Record<string, unknown>>('reminders', { status: 'snoozed' }),
  ]);
  const resumed = snoozed
    .filter(
      (reminder) => typeof reminder.snoozed_until === 'string' && reminder.snoozed_until <= today,
    )
    .map<Record<string, unknown>>((reminder) => ({ ...reminder, status: 'open' }));
  return [...open, ...resumed].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
}
