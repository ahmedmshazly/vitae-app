/**
 * The record the operator last opened (FR-CAP-008). Capture's `n ...` line
 * appends to this id. Session storage keeps it for the tab without inventing a
 * graph of recents.
 */
const KEY = 'vitae:last-viewed-id';

export function rememberViewed(id: string): void {
  if (!id) return;
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // Private mode can refuse sessionStorage; capture then has no target.
  }
}

export function lastViewedId(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
