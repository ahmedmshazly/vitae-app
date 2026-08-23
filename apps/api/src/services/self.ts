/** Resolve the single is_self person node, the anchor of all CRM queries (SRS §4.3.1). */
import type { NodeRecord } from '@vitae/core';
import { repository } from '../db/repository.js';
import { currentWorkspaceId } from '../db/space.js';

// Cached per durable workspace, so Cloud tenants never share a self anchor.
const cachedSelfId = new Map<string, string | null>();

export async function getSelf(): Promise<NodeRecord | null> {
  const workspaceId = currentWorkspaceId();
  const cached = cachedSelfId.get(workspaceId);
  if (cached) {
    const n = await repository.getNode(cached);
    if (n) return n;
    cachedSelfId.delete(workspaceId);
  }
  const people = await repository.listNodes({ type: 'person', limit: 1000 });
  const self = people.find((p) => (p.props as Record<string, unknown>).is_self === true) ?? null;
  cachedSelfId.set(workspaceId, self?.id ?? null);
  return self;
}
