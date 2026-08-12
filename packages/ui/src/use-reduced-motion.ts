/**
 * `prefers-reduced-motion` as a boolean, read natively from matchMedia.
 *
 * This package carries no animation runtime (see the header of overlay.tsx),
 * so it cannot borrow the app's `useReducedMotion`. Design-system motion is
 * CSS driven by Radix [data-state] attributes; this hook exists for the one
 * case CSS cannot cover, a number that has to be interpolated in JS.
 *
 * Defensive on purpose. `window` may be absent (non-DOM evaluation),
 * `matchMedia` may be absent or a partial test stub with neither the modern
 * `addEventListener` nor the legacy `addListener`. In every one of those cases
 * the answer is "not reduced" and the subscription is a no-op, which matches
 * the CSS default: motion plays unless the user asked otherwise.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The live MediaQueryList, or null when there is no usable matchMedia. */
function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(QUERY);
  } catch {
    // A stub that throws is still a stub. Treat it as "no preference".
    return null;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const mql = query();
  if (!mql) return () => {};

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onStoreChange);
    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', onStoreChange);
      }
    };
  }

  // Safari below 14 and older jsdom stubs only carry the deprecated pair.
  if (typeof mql.addListener === 'function') {
    mql.addListener(onStoreChange);
    return () => {
      if (typeof mql.removeListener === 'function') mql.removeListener(onStoreChange);
    };
  }

  // A stub with neither: nothing to listen to, so nothing to unsubscribe.
  return () => {};
}

function getSnapshot(): boolean {
  return query()?.matches ?? false;
}

/** No DOM, no preference. Matches the CSS default. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * True while the user has asked the system for reduced motion. Re-renders when
 * the preference changes, if the platform lets us hear about it.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
