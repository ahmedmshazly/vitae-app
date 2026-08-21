/**
 * The résumé accents the product ships.
 *
 * A hex is not a name. Both the Tailor preview and Settings used to label their
 * swatches "Use #b45309 accent", which tells a screen reader nothing and tells a
 * sighted user only what the eyedropper already said. Every shipped accent
 * carries a word; a template is still free to declare a palette of its own, and
 * anything outside this list falls back to naming itself by its hex rather than
 * going unnamed.
 */
export interface AccentChoice {
  /** The value stored on the résumé and sent to the build service. */
  value: string;
  /** The word a person hears and reads. */
  name: string;
}

export const RESUME_ACCENTS: readonly AccentChoice[] = [
  { value: '#2563eb', name: 'Cobalt' },
  { value: '#0f766e', name: 'Teal' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#b45309', name: 'Amber' },
  { value: '#be123c', name: 'Crimson' },
  { value: '#111827', name: 'Ink' },
];

/** The default accent for a résumé that has never been styled. */
export const DEFAULT_ACCENT = RESUME_ACCENTS[0].value;

/** A word for an accent, or the hex itself when a template supplies its own. */
export function accentName(value: string): string {
  const known = RESUME_ACCENTS.find((a) => a.value.toLowerCase() === value.toLowerCase());
  return known ? known.name : value;
}

/** The accessible name for a swatch button, shared so both pickers agree. */
export function accentLabel(value: string): string {
  return `Use ${accentName(value)} accent`;
}
