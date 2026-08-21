import { Component, type ReactNode } from 'react';
import { Button, ErrorState } from '@vitae/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback, given a `retry` callback that clears the caught error
   * and re-renders children. Defaults to the standard ErrorState panel. */
  fallback?: (retry: () => void) => ReactNode;
}
interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Two levels are wired in App.tsx: one around the shell (a bug in nav/chrome
 * itself falls back to a full-page retry/reload panel) and one around the
 * routed content region, reset per route via `key`, so a bug in one page's
 * render fails to a retryable panel there while the rest of the app
 * (including navigation) keeps working.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // No telemetry pipeline exists yet (SRS: no AI/no external calls at
    // runtime beyond the API), this is the last-resort visibility we have.
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.retry);
    return (
      <div className="app-splash">
        <ErrorState title="This page hit an error" detail={error.message} onRetry={this.retry} />
      </div>
    );
  }
}

/** Shell-level fallback: nav/chrome itself may be broken, so this offers a
 * hard reload alongside the in-place retry rather than assuming a state
 * reset alone can recover.
 *
 * It used to rebuild `vt-error`'s markup by hand to fit the second button in,
 * which forked the alert role and the spacing with it. `ErrorState` takes the
 * extra control now. */
export function ShellErrorFallback({ retry }: { retry: () => void }): ReactNode {
  return (
    <div className="app-splash">
      <ErrorState
        title="Vitae hit an error"
        detail="Reloading usually clears this."
        onRetry={retry}
        retryLabel="Try again"
        action={
          <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        }
      />
    </div>
  );
}
