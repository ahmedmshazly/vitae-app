/**
 * Compatibility adapter for the application toast API.
 *
 * Screens already call `flash(message, { undo, variant })`; the design-system
 * provider calls the same operation `toast(message, { action, variant })`.
 * Keeping this small bridge lets every existing call site gain Radix's queued
 * live region, focus pause, F8 navigation, swipe dismissal, and bounded stack
 * without a flag-day migration.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  ToastProvider as LedgerToastProvider,
  useToast as useLedgerToast,
  type ToastOptions as LedgerToastOptions,
} from '@vitae/ui';

type ToastVariant = 'status' | 'success' | 'error';

interface ToastOptions {
  undo?: () => void | Promise<void>;
  variant?: ToastVariant;
}

interface ToastApi {
  /** Show transient feedback. `undo` stays live on its own queued item. */
  flash: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/** Module-level escape hatch for query/mutation handlers outside React. */
let globalFlash: ToastApi['flash'] | null = null;

export function flashToast(message: string): void {
  globalFlash?.(message, { variant: 'error' });
}

/** An action must stay available long enough to be found and understood. */
const UNDO_MS = 12_000;

function ToastBridge({ children }: { children: ReactNode }) {
  const { toast } = useLedgerToast();

  const flash = useCallback<ToastApi['flash']>(
    (message, opts) => {
      const options: LedgerToastOptions = {
        variant: opts?.variant ?? 'status',
      };

      if (opts?.undo) {
        options.duration = UNDO_MS;
        options.action = {
          label: 'Undo',
          pendingLabel: 'Undoing…',
          errorMessage: "Couldn't undo that change. Try again.",
          onAction: opts.undo,
        };
      }

      toast(message, options);
    },
    [toast],
  );

  useEffect(() => {
    globalFlash = flash;
    return () => {
      if (globalFlash === flash) globalFlash = null;
    };
  }, [flash]);

  const api = useMemo<ToastApi>(() => ({ flash }), [flash]);
  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <LedgerToastProvider itemClassName="toast" announcementMode="item">
      <ToastBridge>{children}</ToastBridge>
    </LedgerToastProvider>
  );
}
