/** Resolve the single is_self person node, the anchor of all CRM queries (SRS §4.3.1). */
import type { NodeRecord } from '@vitae/core';
import { repository } from '../db/repository.js';
import { currentSpace, type Space } from '../db/space.js';

// Cached per data space, the demo graph has its own is_self anchor.
const cachedSelfId = new Map<Space, string | null>();

export async function getSelf(): Promise<NodeRecord | null> {
  const space = currentSpace();
  const cached = cachedSelfId.get(space);
  if (cached) {
    const n = await repository.getNode(cached);
    if (n) return n;
    cachedSelfId.delete(space);
  }
  const people = await repository.listNodes({ type: 'person', limit: 1000 });
  const self = people.find((p) => (p.props as Record<string, unknown>).is_self === true) ?? null;
  cachedSelfId.set(space, self?.id ?? null);
  return self;
}
