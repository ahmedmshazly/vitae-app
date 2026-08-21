import { useState, type Dispatch, type SetStateAction } from 'react';

export interface ServerDraft<T> {
  /** The editable copy. */
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
  /** True when the draft has moved away from what the server holds. */
  dirty: boolean;
  /** Throw the edit away and go back to the server's copy. */
  reset: () => void;
}

/**
 * A local draft of something the server owns.
 *
 * Every editing surface in the app grew the same effect:
 * `useEffect(() => setDraft(fromServer), [fromServer])`. A refetch hands back a
 * fresh object even when the data is identical, so that effect fires on every
 * background refresh and can wipe half a sentence somebody is still typing. It
 * is also the exact shape the React lint rule warns about.
 *
 * This adjusts state during render, which is what React recommends for
 * "reset when a prop changes", and it compares the server's content rather than
 * its object identity, so a refetch that returns the same record leaves an
 * in-flight edit alone.
 */
export function useServerDraft<T>(fromServer: T): ServerDraft<T> {
  const snapshot = JSON.stringify(fromServer);
  const [server, setServer] = useState(snapshot);
  const [draft, setDraft] = useState(fromServer);

  if (snapshot !== server) {
    setServer(snapshot);
    setDraft(fromServer);
  }

  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== snapshot,
    reset: () => setDraft(fromServer),
  };
}
