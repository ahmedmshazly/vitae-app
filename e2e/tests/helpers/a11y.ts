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
  // A stylesheet that has not applied yet reports the same false contrast a
  // half-finished animation does, and for the same reason: axe reads the colour
  // that is on screen now. A route whose CSS arrives in its own chunk was seen
  // failing at 1.51:1, ink #333333 on ground #0f0f0f, with `.docs-root` among
  // the targets. Those are the unstyled defaults, not the page. Wait for the
  // sheets, then the fonts, before anything is measured.
  await page.evaluate(async () => {
    const pending = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter((link) => !(link as HTMLLinkElement).sheet)
      .map(
        (link) =>
          new Promise((settle) => {
            link.addEventListener('load', settle, { once: true });
            // An error settles it too. A sheet that will never arrive is a
            // different defect, and blocking here would report it as a timeout.
            link.addEventListener('error', settle, { once: true });
          }),
      );
    await Promise.all(pending);
    await document.fonts.ready;
  });
  // Entrance motion is part of the design system, and a fading element is a
  // different colour on every frame. Scanning mid-flight sampled half-opacity
  // ink and reported contrast the settled screen never shows: a 27px heading
  // at 2.19:1, a primary button at 4.33:1. Run every animation to its end
  // first, so the scan reads the page the user actually sits with.
  await page.evaluate(async () => {
    for (const a of document.getAnimations()) {
      // An infinite animation has no end to jump to, and finish() throws on
      // one. It also never settles, so nothing here could wait for it.
      try {
        a.finish();
      } catch {
        /* leave it running */
      }
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (within) builder = builder.include(within);
  const results = await builder.analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
