import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Automated a11y scan (WCAG 2.0/2.1 A+AA rule set) for the current page.
 * Fails with the violation list attached so a broken run is debuggable
 * without re-running locally. Foundation wires this into one shell-level
 * spec; each screen adds it to its own spec as it's touched, per the
 * rebrand protocol's "Test" step.
 *
 * Pass `within` when a modal is open. Radix hides the rest of the page from
 * assistive tech with aria-hidden, but axe intermittently evaluates the
 * still-painted content behind the backdrop before that lands, and dimmed
 * body text under a 66% scrim will always fail contrast. The page behind has
 * its own scan in its own spec; here the dialog is what is under test.
 */
export async function expectNoA11yViolations(page: Page, within?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (within) builder = builder.include(within);
  const results = await builder.analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
