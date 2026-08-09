import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 16: Atlas.
 *
 * The only screen that draws over something the app did not make. Everything
 * the app puts on top of the tiles was still in the previous palette: eleven
 * hardcoded blue-blacks and sky-blues in the CSS, a white glow ring, two drop
 * shadows and six off-scale type sizes.
 */

const MAP = '**/api/v1/map*';

async function goAtlas(page: Page) {
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Atlas', exact: true })).toBeVisible();
}

test('the overlay is drawn in tokens, not in a palette of its own', async ({ page }) => {
  await signIn(page);
  await goAtlas(page);
  await expect(page.locator('.atlas__hud')).toBeVisible({ timeout: 15_000 });

  // Every one of these carried a literal: rgba(16,20,29,·) on the HUD and pins,
  // #090d15 on the panel, rgba(9,13,21,·) on labels, #4a5550 on the attribution,
  // and rgba(125,211,252,0.08), the same sky tint removed from Warm intros.
  const inks = await page
    .locator('.atlas__hud, .atlas__hudbtn, .atlas__panel, .atlas__attr')
    .evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color, shadow: cs.boxShadow };
      }),
    );
  expect(inks.length).toBeGreaterThan(0);

  // Assert against the tokens themselves rather than guessing at "blueness":
  // every ink on this chrome has to be a colour the identity actually defines.
  const allowed = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--ae-bg', '--ae-surface', '--ae-surface-raised', '--ae-surface-overlay',
      '--ae-fg', '--ae-fg-soft', '--ae-fg-strong', '--ae-muted', '--ae-faint',
      '--ae-border', '--ae-border-strong', '--ae-accent', '--ae-accent-ink', '--ae-accent-bg',
    ];
    const hex = names.map((n) => cs.getPropertyValue(n).trim()).filter(Boolean);
    return hex.map((h) => {
      const v = h.replace('#', '');
      return `rgb(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)})`;
    });
  });

  for (const ink of inks) {
    for (const value of [ink.bg, ink.fg]) {
      if (value === 'rgba(0, 0, 0, 0)' || !value) continue;
      expect(allowed, `${value} is not a token colour`).toContain(value);
    }
  }
});

test('nothing on the atlas chrome is set below the type scale', async ({ page }) => {
  await signIn(page);
  await goAtlas(page);
  await expect(page.locator('.atlas__hud')).toBeVisible({ timeout: 15_000 });

  // Six rules were off the scale: 13px, 1.05rem and four at 10px.
  const tooSmall = await page
    .locator('.page--atlas *')
    .evaluateAll((els) =>
      els
        .filter((el) => el.textContent?.trim())
        .map((el) => ({ px: parseFloat(getComputedStyle(el).fontSize), t: el.textContent!.trim().slice(0, 16) }))
        .filter((r) => r.px > 0 && r.px < 11),
    );
  expect(tooSmall).toEqual([]);
});

test('a failed load says so instead of drawing an empty world', async ({ page }) => {
  await signIn(page);
  await page.route(MAP, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the atlas service is down"}}',
    }),
  );
  await page.goto('/map');

  await expect(page.getByRole('alert')).toContainText('the atlas service is down');
});

test('the map has a non-visual equivalent, and it is reachable', async ({ page }) => {
  await signIn(page);
  await goAtlas(page);

  // The map canvas is role="presentation" (WebGL tells assistive tech nothing),
  // so the list is the equivalent, and it has to be findable.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const list = page.locator('.atlas__list, .lifemap__searchlist').first();
  await expect(list).toBeVisible();
  await expect(list).toContainText(/\w/);
});

test('the atlas has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goAtlas(page);
  await expect(page.locator('.atlas__hud')).toBeVisible({ timeout: 15_000 });
  await expectNoA11yViolations(page);
});
