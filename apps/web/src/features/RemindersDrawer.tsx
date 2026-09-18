/**
 * The reminders drawer, anchored to the top bar's bell.
 *
 * It used to be a bare absolutely-positioned div with `role="dialog"` and
 * hand-rolled Escape and outside-click listeners: no focus containment, no
 * focus restoration to the bell, and a `role` that promised semantics nothing
 * implemented. It is a Popover now, so Radix owns all of that.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Glyph, Mono, Popover, SkeletonRows } from '@vitae/ui';
import { api } from '../lib/api.js';
import { todayIso } from '../lib/dates.js';
import { useToast } from './Toast.js';
import { useCanWrite, WRITE_LOCK_HINT } from '../lib/auth.js';

interface Reminder {
  id: string;
  /** Both writers (capture and the interaction logger) store `note`. This was
   * typed and read as `text`, so every row in the drawer rendered blank while
   * the bell counted them correctly. */
  note: string;
  due_on: string;
  subject_id?: string;
  reason?: string;
}

/**
 * FR-025: "overdue" and "due today" are judged against the user's local
 * calendar date, due_on is a plain YYYY-MM-DD with no timezone attached.
 * The tone always ships with the word, never as a bare coloured dot.
 */
function due(dueOn: string): { label: string; tone: string } {
  const today = todayIso();
  if (dueOn < today) return { label: 'overdue', tone: 'text-danger' };
  if (dueOn === today) return { label: 'due today', tone: 'text-warning' };
  return { label: dueOn, tone: 'text-muted' };
}

export function RemindersDrawer({
  open,
  onOpenChange,
  trigger,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  onCapture?: () => void;
}) {
  const qc = useQueryClient();
  const { flash } = useToast();
  const canWrite = useCanWrite();

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.get<{ reminders: Reminder[] }>('/reminders?due=all'),
    enabled: open,
  });

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['reminders'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }

  const done = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/done`, {}),
    onSuccess: async (_d, id) => {
      await invalidate();
      flash('Reminder marked done.', {
        variant: 'success',
        undo: async () => {
          await api.post(`/reminders/${id}/reopen`, {});
          await invalidate();
        },
      });
    },
    onError: (err) => {
      flash(
        err instanceof Error
          ? `Couldn't mark reminder done: ${err.message}`
          : "Couldn't mark reminder done.",
        { variant: 'error' },
      );
    },
  });

  const snooze = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/snooze`, { days: 7 }),
    onSuccess: async () => {
      await invalidate();
      flash('Reminder snoozed for 7 days.', { variant: 'success' });
    },
    onError: (err) => {
      flash(
        err instanceof Error
          ? `Couldn't snooze reminder: ${err.message}`
          : "Couldn't snooze reminder.",
        { variant: 'error' },
      );
    },
  });

  const reminders = data?.reminders ?? [];
  // One row at a time: both actions refetch the whole list, so letting a
  // second start would settle a reminder whose row is about to move.
  const pendingId =
    (done.isPending ? done.variables : undefined) ??
    (snooze.isPending ? snooze.variables : undefined) ??
    null;

  return (
    <Popover label="Reminders" open={open} onOpenChange={onOpenChange} trigger={trigger} align="end" wide>
      <div className="-m-3">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 className="u-display flex items-center gap-2 text-md text-ink-strong">
            <Glyph name="bell" size={15} /> Reminders
          </h2>
          {data && <Mono className="text-sm text-muted">{reminders.length} open</Mono>}
        </div>

        {onCapture && (
          <div className="border-b border-hairline px-4 py-3">
            <Button
              size="sm"
              glyph="plus"
              disabled={!canWrite}
              title={canWrite ? undefined : WRITE_LOCK_HINT}
              onClick={() => {
                onOpenChange(false);
                onCapture();
              }}
            >
              Capture with a date
            </Button>
          </div>
        )}

        {isError ? (
          // The shared error panel, not a second dialect of one: the drawer
          // was writing its own alert markup for the same job.
          <div className="p-4">
            <ErrorState
              title="Couldn't load reminders"
              detail={(error as Error | null)?.message}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          </div>
        ) : isLoading ? (
          <div className="px-4 py-3">
            <SkeletonRows rows={3} />
          </div>
        ) : reminders.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted">
            No open reminders. Add <span className="font-mono text-ink-soft">^tomorrow</span> or a
            specific date to a capture to remind yourself later.
          </p>
        ) : (
          <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-0">
            {reminders.map((r) => {
              const d = due(r.due_on);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0"
                  // Both writes go to the server and both invalidate this
                  // list, so a slow one used to look like a click that missed.
                  aria-busy={pendingId === r.id}
                >
                  <span
                    id={`reminder-note-${r.id}`}
                    className="block text-ink [overflow-wrap:anywhere]"
                  >
                    {r.note?.trim() || 'Untitled reminder'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto">
                      <Mono className={`text-xs ${d.tone}`}>{d.label}</Mono>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId != null || !canWrite}
                      aria-describedby={`reminder-note-${r.id}`}
                      title={canWrite ? 'Move this reminder forward by 7 days' : WRITE_LOCK_HINT}
                      onClick={() => snooze.mutate(r.id)}
                    >
                      {snooze.isPending && snooze.variables === r.id
                        ? 'Snoozing...'
                        : 'Snooze 7 days'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId != null || !canWrite}
                      aria-describedby={`reminder-note-${r.id}`}
                      title={canWrite ? undefined : WRITE_LOCK_HINT}
                      onClick={() => done.mutate(r.id)}
                    >
                      {done.isPending && done.variables === r.id ? 'Marking...' : 'Done'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Popover>
  );
}
