import { isNodeType, type NodeType } from '@vitae/core';

/** Detail page for a node, people/orgs keep CRM hubs; everything else is `/n/:id`. */
export function entityHref(type: string, id: string): string {
  if (type === 'person') return `/people/${id}`;
  if (type === 'organization') return `/orgs/${id}`;
  return `/n/${id}`;
}

/**
 * List page for a node type. People/orgs stay special; repositories keep the
 * GitHub hub; every other creatable type uses generic Browse.
 */
export function entityListHref(type: string): string {
  if (type === 'person') return '/people';
  if (type === 'organization') return '/orgs';
  if (type === 'repository') return '/repositories';
  if (isNodeType(type)) return `/browse/${type as NodeType}`;
  return '/collections';
}

export function typeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}
