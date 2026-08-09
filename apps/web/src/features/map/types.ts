export interface MapRecord {
  id: string;
  type: string;
  title: string;
  date?: string;
  link: 'city' | 'LOCATED_IN' | 'VISITED';
}

export interface MapCity {
  city: string;
  count: number;
  types: Record<string, number>;
  records: MapRecord[];
  lat?: number;
  lng?: number;
}

export interface MapTripStop {
  city: string;
  nights?: number;
  date?: string;
  lat?: number;
  lng?: number;
}

export interface MapTrip {
  id: string;
  title: string;
  stops: MapTripStop[];
  companionIds: string[];
  start?: string;
  end?: string;
}

export interface MapData {
  cities: MapCity[];
  trips: MapTrip[];
}

export type AtlasViewMode = 'atlas' | 'list';

export type AtlasPeriod = 'all' | 'year' | 'custom';

export const TYPE_FILTERS: Array<{ label: string; types: string[] }> = [
  { label: 'people', types: ['person'] },
  { label: 'orgs', types: ['organization'] },
  { label: 'trips', types: ['trip'] },
  { label: 'events', types: ['event'] },
  { label: 'other', types: [] },
];

export const NAMED_TYPES = new Set(['person', 'organization', 'trip', 'event']);
