/**
 * Component-level axe helper for Vitest (jsdom). Complements Playwright page
 * scans in e2e/tests/helpers/a11y.ts.
 */
import { axe } from 'vitest-axe';
import type { AxeResults } from 'axe-core';

export async function runAxe(container: Element): Promise<AxeResults> {
  return axe(container, {
    rules: {
      // jsdom has no real layout/color pipeline; color-contrast is for Playwright.
      'color-contrast': { enabled: false },
    },
  });
}
