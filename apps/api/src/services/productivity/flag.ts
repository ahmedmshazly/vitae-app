/**
 * Default-off API gate for the productivity vertical slice (ADR 0013).
 *
 * Read on every request so tests can toggle the env var without rebooting the
 * process. A distinct disabled code would advertise that the mount exists.
 */
import { PRODUCTIVITY_API_FLAG } from '@vitae/core';

const ENABLED = new Set(['true', '1', 'yes']);

export function isProductivityEnabled(
  source: NodeJS.ProcessEnv = process.env,
  flag = PRODUCTIVITY_API_FLAG,
): boolean {
  const raw = source[flag];
  if (typeof raw !== 'string') return false;
  return ENABLED.has(raw.trim().toLowerCase());
}
