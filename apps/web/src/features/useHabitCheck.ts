import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface HabitCheck {
  id: string;
  checkedToday: boolean;
  grid: boolean[];
  streak: number;
}
interface HabitCache {
  habits: HabitCheck[];
}

/** Serialize the toggle contract and roll back only the fields this action owns. */
export function useHabitCheck() {
  const qc = useQueryClient();
  const running = useRef(false);
  const mutation = useMutation({
    mutationFn: (id: string) => api.post(`/habits/${id}/toggle`, {}),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['dashboard'] });
      const previous = qc
        .getQueryData<HabitCache>(['dashboard'])
        ?.habits.find((habit) => habit.id === id);
      qc.setQueryData<HabitCache>(
        ['dashboard'],
        (current) =>
          current && {
            ...current,
            habits: current.habits.map((habit) =>
              habit.id === id
                ? {
                    ...habit,
                    checkedToday: !habit.checkedToday,
                    grid: [...habit.grid.slice(0, -1), !habit.checkedToday],
                  }
                : habit,
            ),
          },
      );
      return { previous };
    },
    onError: (_error, id, context) => {
      const previous = context?.previous;
      if (!previous) return;
      qc.setQueryData<HabitCache>(
        ['dashboard'],
        (current) =>
          current && {
            ...current,
            habits: current.habits.map((habit) =>
              habit.id === id
                ? {
                    ...habit,
                    checkedToday: previous.checkedToday,
                    grid: previous.grid,
                    streak: previous.streak,
                  }
                : habit,
            ),
          },
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  async function setChecked(id: string, desired: boolean) {
    if (running.current) throw new Error('Another habit is still saving. Try again in a moment.');
    const current = qc
      .getQueryData<HabitCache>(['dashboard'])
      ?.habits.find((habit) => habit.id === id);
    // An older Undo must not invert a habit that has already been restored.
    if (current?.checkedToday === desired) return;
    running.current = true;
    try {
      await mutation.mutateAsync(id);
    } finally {
      running.current = false;
    }
  }

  return { setChecked, isPending: mutation.isPending, pendingId: mutation.variables };
}
