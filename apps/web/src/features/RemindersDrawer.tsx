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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { flash } = useToast();

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.get<{ reminders: Reminder[] }>('/reminders?due=all'),
    enabled: open,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['reminders'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const done = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/done`, {}),
    onSuccess: (_d, id) => {
      invalidate();
      flash('Done', {
        undo: async () => {
          await api.post(`/reminders/${id}/reopen`, {});
          invalidate();
        },
      });
    },
  });

  const snooze = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/snooze`, { days: 7 }),
    onSuccess: () => {
      invalidate();
      flash('Snoozed 7 days');
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
    <Popover open={open} onOpenChange={onOpenChange} trigger={trigger} align="end" wide>
      <div className="-m-3">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 className="u-display flex items-center gap-2 text-md text-ink-strong">
            <Glyph name="bell" size={15} /> Reminders
          </h2>
          <Mono className="text-sm text-muted">{reminders.length}</Mono>
        </div>

        {isError ? (
          // The shared error panel, not a second dialect of one: the drawer
          // was writing its own alert markup for the same job.
          <div className="p-4">
            <ErrorState
              title="Couldn’t load reminders"
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
            Nothing due. Capture with ⌘K and add a <span className="font-mono text-ink-soft">^date</span> to put
            something here.
          </p>
        ) : (
          <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-0">
            {reminders.map((r) => {
              const d = due(r.due_on);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-hairline px-4 py-2 last:border-b-0"
                  // Both writes go to the server and both invalidate this
                  // list, so a slow one used to look like a click that missed.
                  aria-busy={pendingId === r.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{r.note}</span>
                    <Mono className={`text-xs ${d.tone}`}>{d.label}</Mono>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingId != null}
                    onClick={() => snooze.mutate(r.id)}
                  >
                    {snooze.isPending && snooze.variables === r.id ? 'Snoozing…' : 'Snooze'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingId != null}
                    onClick={() => done.mutate(r.id)}
                  >
                    {done.isPending && done.variables === r.id ? 'Marking…' : 'Done'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Popover>
  );
}
