import { isNodeType, type NodeType } from '@vitae/core';
import { isProductivityEnabled } from './productivity-flag.js';

/** Detail page for a node, people/orgs keep Network dossiers; everything else is `/n/:id`. */
export function entityHref(type: string, id: string): string {
  if (type === 'person') return `/network/people/${id}`;
  if (type === 'organization') return `/network/organizations/${id}`;
  if (type === 'application') return `/career/applications/${id}`;
  return `/n/${id}`;
}

/**
 * List page for a node type. People/orgs stay special; repositories keep the
 * GitHub hub; every other creatable type uses generic Browse.
 */
export function entityListHref(type: string): string {
  if (type === 'person') return '/network/people';
  if (type === 'organization') return '/network/organizations';
  if (type === 'application') return '/career/applications';
  if (type === 'repository') return '/data/sources/github';
  if (type === 'task' && isProductivityEnabled()) return '/today/tasks';
  if (isNodeType(type)) return `/browse/${type as NodeType}`;
  return '/explore/library';
}

export function typeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}
