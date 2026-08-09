import type { GraphLens } from './types.js';

/** Entity filter groups for the life-map toolbar (plan: Career / People / Life / Content). */
export const FILTER_GROUPS: ReadonlyArray<{ label: string; types: readonly string[] }> = [
  { label: 'People', types: ['person'] },
  {
    label: 'Career',
    types: [
      'organization',
      'role',
      'project',
      'skill',
      'repository',
      'education',
      'certification',
      'course',
      'award',
      'job_posting',
      'application',
      'interview',
      'reference',
    ],
  },
  {
    label: 'Life',
    types: [
      'event',
      'interaction',
      'task',
      'goal',
      'habit',
      'journal_entry',
      'idea',
      'location',
      'trip',
      'subscription',
      'account',
      'asset',
      'health_log',
    ],
  },
  {
    label: 'Content',
    types: ['post', 'publication', 'talk', 'link', 'document', 'media_item', 'highlight'],
  },
];

export const DEFAULT_ACTIVE_TYPES = new Set([
  'person',
  'organization',
  'role',
  'project',
  'skill',
  'event',
  'education',
]);

/** Career spine lens, keep these bright; dim everything else. */
export const CAREER_SPINE_TYPES = new Set([
  'person',
  'organization',
  'role',
  'project',
  'skill',
  'repository',
  'education',
]);

export const LENSES: ReadonlyArray<{ id: GraphLens; label: string; hint: string }> = [
  { id: 'neighborhood', label: 'Neighborhood', hint: 'Hover lights neighbors (all lenses)' },
  { id: 'strength', label: 'Tie strength', hint: 'Thicken KNOWS by strength; hover still dims' },
  { id: 'career', label: 'Career spine', hint: 'Emphasize career entities; hover lights neighbors' },
  { id: 'hubs', label: 'Hubs', hint: 'Size by degree; hover lights neighbors' },
  { id: 'edgeKinds', label: 'Edge kinds', hint: 'Filter by relationship type; hover lights neighbors' },
];

export function shortTypeLabel(type: string): string {
  if (type === 'organization') return 'org';
  if (type === 'journal_entry') return 'journal';
  if (type === 'job_posting') return 'job';
  return type.replace(/_/g, ' ');
}
