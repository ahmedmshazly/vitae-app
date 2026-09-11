import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SkeletonRows, type GlyphName } from '@vitae/ui';

export interface QueryPanelProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasData: boolean;
  onRetry: () => void;
  loadingLabel: string;
  errorTitle: string;
  emptyTitle: string;
  emptyHint: string;
  emptyGlyph?: GlyphName;
  emptyAction?: ReactNode;
  children: ReactNode;
}

export function QueryPanel({
  isLoading,
  isError,
  error,
  hasData,
  onRetry,
  loadingLabel,
  errorTitle,
  emptyTitle,
  emptyHint,
  emptyGlyph = 'task',
  emptyAction,
  children,
}: QueryPanelProps) {
  if (isLoading && !hasData) {
    return <SkeletonRows label={loadingLabel} />;
  }
  if (isError && !hasData) {
    return (
      <ErrorState
        title={errorTitle}
        detail={error instanceof Error ? error.message : undefined}
        onRetry={onRetry}
      />
    );
  }
  if (!hasData) {
    return <EmptyState glyph={emptyGlyph} title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  }
  return (
    <>
      {isError && (
        <ErrorState
          title={errorTitle}
          detail={error instanceof Error ? error.message : undefined}
          onRetry={onRetry}
        />
      )}
      {children}
    </>
  );
}
