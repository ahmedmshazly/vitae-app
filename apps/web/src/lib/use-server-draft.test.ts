import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useServerDraft } from './use-server-draft.js';

describe('useServerDraft', () => {
  it('starts clean on the server copy', () => {
    const { result } = renderHook(() => useServerDraft({ name: 'Ada' }));
    expect(result.current.draft).toEqual({ name: 'Ada' });
    expect(result.current.dirty).toBe(false);
  });

  it('reports dirty once the draft moves', () => {
    const { result } = renderHook(() => useServerDraft({ name: 'Ada' }));
    act(() => result.current.setDraft({ name: 'Ada Lovelace' }));
    expect(result.current.dirty).toBe(true);
  });

  it('keeps an in-flight edit when a refetch returns the same content', () => {
    const { result, rerender } = renderHook(({ server }) => useServerDraft(server), {
      initialProps: { server: { name: 'Ada' } },
    });
    act(() => result.current.setDraft({ name: 'Ada Lov' }));
    rerender({ server: { name: 'Ada' } });
    expect(result.current.draft).toEqual({ name: 'Ada Lov' });
    expect(result.current.dirty).toBe(true);
  });

  it('adopts the server copy when the content actually changed', () => {
    const { result, rerender } = renderHook(({ server }) => useServerDraft(server), {
      initialProps: { server: { name: 'Ada' } },
    });
    act(() => result.current.setDraft({ name: 'Ada Lov' }));
    rerender({ server: { name: 'Grace' } });
    expect(result.current.draft).toEqual({ name: 'Grace' });
    expect(result.current.dirty).toBe(false);
  });

  it('resets back to the server copy on request', () => {
    const { result } = renderHook(() => useServerDraft(['k8s']));
    act(() => result.current.setDraft(['k8s', 'ts']));
    act(() => result.current.reset());
    expect(result.current.draft).toEqual(['k8s']);
    expect(result.current.dirty).toBe(false);
  });
});
