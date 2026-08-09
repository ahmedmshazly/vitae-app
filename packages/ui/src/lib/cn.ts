import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class-name composition, twMerge is a no-op on vt-* strings (it only
 * recognizes Tailwind utility patterns), so this is a safe drop-in for
 * plain class concatenation as well as Tailwind-utility merging. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
