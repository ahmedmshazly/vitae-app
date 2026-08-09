import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { enter, exit } from '../lib/motion.js';

type ToastVariant = 'status' | 'error';

interface ToastState {
  message: string;
  variant: ToastVariant;
  undo?: () => void | Promise<void>;
}

interface ToastOptions {
  undo?: () => void | Promise<void>;
  variant?: ToastVariant;
}

interface ToastApi {
  /** Show a transient toast. Pass `undo` to render an Undo action (compensating call). */
  flash: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/** Module-level escape hatch for non-component callers (the global mutation
 * error handler in main.tsx). Wired up by <ToastProvider> when it renders. */
let globalFlash: ToastApi['flash'] | null = null;

export function flashToast(message: string): void {
  globalFlash?.(message, { variant: 'error' });
}

const DEFAULT_MS = 5000;
const UNDO_MS = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const remaining = useRef(DEFAULT_MS);
  const reducedMotion = useReducedMotion();

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const scheduleDismiss = useCallback(
    (ms: number) => {
      clearTimer();
      remaining.current = ms;
      deadline.current = Date.now() + ms;
      timer.current = setTimeout(() => {
        timer.current = null;
        remaining.current = 0;
        setToast(null);
      }, ms);
    },
    [clearTimer],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    remaining.current = 0;
    setToast(null);
  }, [clearTimer]);

  const pauseDismiss = useCallback(() => {
    if (!timer.current) return;
    remaining.current = Math.max(0, deadline.current - Date.now());
    clearTimer();
  }, [clearTimer]);

  const resumeDismiss = useCallback(() => {
    if (remaining.current > 0) scheduleDismiss(remaining.current);
  }, [scheduleDismiss]);

  const flash = useCallback(
    (message: string, opts?: ToastOptions) => {
      const next: ToastState = { message, variant: opts?.variant ?? 'status', undo: opts?.undo };
      setToast(next);
      scheduleDismiss(next.undo ? UNDO_MS : DEFAULT_MS);
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    globalFlash = flash;
    return () => {
      if (globalFlash === flash) globalFlash = null;
    };
  }, [flash]);

  useEffect(() => clearTimer, [clearTimer]);

  const api = useMemo(() => ({ flash }), [flash]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role={toast.variant === 'error' ? 'alert' : 'status'}
            variants={{ ...enter(!!reducedMotion), ...exit(!!reducedMotion) }}
            initial="initial"
            animate="animate"
            exit="exit"
            onPointerEnter={pauseDismiss}
            onPointerLeave={resumeDismiss}
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="toast__undo"
                onClick={() => {
                  const fn = toast.undo!;
                  dismiss();
                  void fn();
                }}
              >
                Undo
              </button>
            )}
            <button
              className="toast__close"
              aria-label="Dismiss"
              onClick={dismiss}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}
