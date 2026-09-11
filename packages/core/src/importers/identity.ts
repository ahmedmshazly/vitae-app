/**
 * Identity keys for the file importers (SRS FR-SYNC-002: re-import is
 * longitudinal).
 *
 * A record parsed out of a file carries no Vitae id, so the only thing that can
 * make a second import of the same file converge instead of forking the graph
 * is an identifier the *source itself* states: a vCard UID, an iCalendar UID, a
 * bookmark's URL, a LinkedIn profile slug, an address book's email. These
 * helpers turn those into the `<system>:<kind>:<key>` shape that
 * `schema/envelope.ts` persists and `externalNodeId` hashes into a document id,
 * so a key synthesized here and a key that arrived inside a
 * `vitae.graph.bundle` are the same kind of fact and land on the same document.
 *
 * Nothing here invents an identity. A row whose source states nothing stable
 * gets no key and stays a create. That is the honest answer: hashing a display
 * name would silently converge two different people who happen to share one,
 * and an import that merges strangers is worse than an import that duplicates.
 *
 * `csv.ts` has no helper of its own because it is a generic RFC 4180 reader
 * with no idea which column holds a person; the contacts importer picks the
 * email column out of the record and calls `contactEmailKey` with it.
 */

/**
 * The shape `identityKey` in `schema/envelope.ts` enforces, mirrored here so a
 * key that the envelope would reject never reaches it. Only the system and kind
 * segments are constrained; the value may hold colons and slashes, which is
 * what lets a URN-shaped vCard UID or a whole URL be a key.
 */
const KEY_SHAPE = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:\S+$/;

/** Matches the envelope's `.max(200)`. */
const KEY_MAX_LENGTH = 200;

/**
 * Assemble and validate one key, or return null when the source value cannot
 * make one. Lowercased here rather than at the envelope, because the key is
 * compared against stored keys and hashed into a document id long before any
 * Zod transform runs, and a casing difference at either of those points forks
 * the record it was meant to converge.
 */
export function identityKeyFor(
  system: string,
  kind: string,
  value: string | null | undefined,
): string | null {
  const key = `${system}:${kind}:${(value ?? '').trim()}`.toLowerCase();
  if (key.length > KEY_MAX_LENGTH) return null;
  return KEY_SHAPE.test(key) ? key : null;
}

/**
 * `contact:email:<address>` for a person an address book names by email.
 *
 * Deliberately system-neutral: one address in a vCard, in a Google CSV export
 * and in a LinkedIn connections file is one person, and naming the exporting
 * app in the key would fork them into three. The address must be one the person
 * schema would accept, since a key on an address that gets sanitized away at
 * write time identifies a record nobody will ever store.
 */
export function contactEmailKey(email: string | null | undefined): string | null {
  const address = (email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return identityKeyFor('contact', 'email', address);
}

/** `vcard:person:<uid>`: the UID an address book exports for its own record. */
export function vcardUidKey(uid: string | null | undefined): string | null {
  return identityKeyFor('vcard', 'person', uid);
}

/** `ics:event:<uid>`: RFC 5545 makes UID the event's global identity. */
export function icsEventKey(uid: string | null | undefined): string | null {
  return identityKeyFor('ics', 'event', uid);
}

/**
 * `linkedin:person:<slug>` from a profile URL.
 *
 * The same shape Aperture emits (`fixtures/vitae-bundle.golden.json` carries
 * `linkedin:person:jane-smith`), so a Connections.csv row and a scraped bundle
 * for one profile converge on one record instead of two. A LinkedIn URL with no
 * `/in/<slug>` segment points at a company page or a post, not a person, and
 * yields nothing rather than a key derived from whatever else is in the path.
 *
 * The slug is not percent-decoded: the encoded form is what LinkedIn puts in
 * every export, so decoding would only introduce a way for two exports of the
 * same profile to disagree.
 */
export function linkedinProfileKey(url: string | null | undefined): string | null {
  const match = (url ?? '').trim().match(/\/in\/([^/?#]+)/i);
  return match ? identityKeyFor('linkedin', 'person', match[1]) : null;
}

/**
 * `bookmark:link:<url>` for a saved link, whose URL is the only thing a
 * bookmarks export states about it that survives a retitle.
 *
 * A URL long enough to push the key past the envelope's 200-character ceiling
 * yields nothing rather than a truncated key, because a truncated URL is a
 * prefix and two different bookmarks under one long path would collide on it.
 * Those links are still caught on re-import by the importer's exact-URL
 * duplicate rule, which does not have to fit in a key.
 */
export function bookmarkUrlKey(url: string | null | undefined): string | null {
  const normalized = normalizeUrl(url);
  return normalized ? identityKeyFor('bookmark', 'link', normalized) : null;
}

/** `github:repo:<id>`: GitHub's numeric id survives a rename. */
export function githubRepoKey(id: number | string | null | undefined): string | null {
  if (id == null || id === '') return null;
  const value = String(id).trim();
  if (!/^\d+$/.test(value)) return null;
  return identityKeyFor('github', 'repo', value);
}

/** `todoist:task:<id>` when the file states a Todoist id. Never a line number. */
export function todoistTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('todoist', 'task', id);
}

/** `things:task:<uuid>` when Cultured Code states the to-do's id. */
export function thingsTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('things', 'task', id);
}

/** `ticktick:task:<id>` from the backup's `taskId` column. */
export function ticktickTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('ticktick', 'task', id);
}

/** `trello:card:<id>` for a card or checklist item the board JSON names. */
export function trelloCardKey(id: string | null | undefined): string | null {
  return identityKeyFor('trello', 'card', id);
}

/** `asana:task:<gid>` from the export's Task ID column. */
export function asanaTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('asana', 'task', id);
}

/** `notion:page:<id>` when the CSV states a page id. */
export function notionPageKey(id: string | null | undefined): string | null {
  return identityKeyFor('notion', 'page', id);
}

/**
 * `tasks_json:task:<id>` for a `vitae.tasks` / `fourfold.transfer` item the
 * document itself numbers. The importer kind is the system, so the same file
 * re-imported as the same kind converges.
 */
export function tasksJsonTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('tasks_json', 'task', id);
}

/** `tasks_csv:task:<id>` when a generic task CSV states a `source_id`. */
export function tasksCsvTaskKey(id: string | null | undefined): string | null {
  return identityKeyFor('tasks_csv', 'task', id);
}

/**
 * `project:<system>:<id>` when the file states a project id. A project that
 * is only a name gets no key: names are not identities.
 */
export function taskProjectKey(
  system: string,
  id: string | null | undefined,
): string | null {
  return identityKeyFor('project', system, id);
}

/**
 * Canonical form of a URL for keying: scheme and host lowercased by `URL`
 * itself, the fragment dropped (it addresses a place inside one page, not a
 * different page), and a bare trailing slash removed so `https://x.test/` and
 * `https://x.test` are one bookmark. The query is kept: it routinely selects
 * which page you are looking at.
 *
 * `www.` is *not* stripped. It is a different host, and the source said which
 * one it meant.
 */
function normalizeUrl(raw: string | null | undefined): string | null {
  try {
    const url = new URL((raw ?? '').trim());
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return null;
  }
}
