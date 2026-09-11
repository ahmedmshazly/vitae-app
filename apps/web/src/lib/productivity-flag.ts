/**
 * Default-off web gate for the Fourfold productivity surfaces (ADR 0013, FR-PROD-001).
 *
 * Same truthy tokens as the API flag: `true` / `1` / `yes`. Unset or anything
 * else keeps Today, Planner, and the Ledger as they are (FR-PROD-002).
 */
import { PRODUCTIVITY_WEB_FLAG } from '@vitae/core';

const ENABLED = new Set(['true', '1', 'yes']);

export { PRODUCTIVITY_WEB_FLAG };

export function isProductivityEnabled(
  raw: string | undefined = import.meta.env.VITE_PUBLIC_PRODUCTIVITY_ENABLED,
): boolean {
  if (typeof raw !== 'string') return false;
  return ENABLED.has(raw.trim().toLowerCase());
}
