import { useEffect, useRef } from 'react';
import type { FgNode, GraphMode } from './types.js';

export interface GraphKeyboardApi {
  selected: FgNode | null;
  neighbors: string[];
  mode: GraphMode;
  depth: number;
  searchOpen: boolean;
  onSelectId: (id: string | null) => void;
  onOpen: (node: FgNode) => void;
  onFocus: (node: FgNode) => void;
  onMode: (mode: GraphMode) => void;
  onDepth: (depth: number) => void;
  onToggleSearch: () => void;
  onClear: () => void;
  enabled: boolean;
}

/**
 * Life-map locomotion: ←/→ neighbors, Enter open, F focus, P path, Esc clear,
 * +/- depth, ⌘/Ctrl+F search. Skips when typing in inputs.
 */
export function useGraphKeyboard(api: GraphKeyboardApi): void {
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!api.enabled) return;

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      const a = apiRef.current;
      if (isTypingTarget(e.target) && !(e.key === 'Escape' && a.searchOpen)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        a.onToggleSearch();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        a.onClear();
        return;
      }

      if (a.searchOpen) return;

      const k = e.key;
      if (k === 'p' || k === 'P') {
        e.preventDefault();
        a.onMode(a.mode === 'path' ? 'explore' : 'path');
        return;
      }
      if (k === '+' || k === '=') {
        e.preventDefault();
        a.onDepth(Math.min(a.depth + 1, 4));
        return;
      }
      if (k === '-' || k === '_') {
        e.preventDefault();
        a.onDepth(Math.max(a.depth - 1, 1));
        return;
      }

      if (!a.selected) return;

      if (k === 'Enter') {
        e.preventDefault();
        a.onOpen(a.selected);
        return;
      }
      if (k === 'f' || k === 'F') {
        e.preventDefault();
        a.onFocus(a.selected);
        return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        if (a.neighbors.length === 0) return;
        const idx = a.neighbors.indexOf(a.selected.id);
        const next =
          k === 'ArrowRight'
            ? a.neighbors[(idx + 1) % a.neighbors.length]!
            : a.neighbors[(idx - 1 + a.neighbors.length) % a.neighbors.length]!;
        a.onSelectId(next);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api.enabled]);
}
