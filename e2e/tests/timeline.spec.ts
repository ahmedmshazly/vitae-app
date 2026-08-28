import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { createOngoingRole, deleteNode } from './helpers/fixtures';

/**
 * Screen 15: Chronograph.
 *
 * This screen carried more of the previous identity than any other: an aurora
 * wash and dot grid on the track, a frosted-glass year header, a gradient
 * fading the sticky lane labels, a blue glow on the current bar, and five type
 * sizes under the 11px floor. Most of this spec is about what a bar says.
 */

const TIMELINE = '**/api/v1/timeline';
const REVIEW = '**/api/v1/timeline/review*';

async function goTimeline(page: Page) {
  await page.goto('/timeline');
  await expect(page.getByRole('heading', { name: 'Chronograph', exact: true })).toBeVisible();
  await expect(page.locator('.tl__bar').first()).toBeVisible({ timeout: 15_000 });
}

test('the track is flat ground, no wash, no texture, no frosted glass', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);

  const main = await page.locator('.chronograph__main').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { image: cs.backgroundImage, color: cs.backgroundColor };
  });
  // Was #080b11 under a cyan radial wash and a 26px dot grid.
  expect(main.image).toBe('none');

  const years = await page.locator('.tl__years').evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      filter: cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter'),
      image: cs.backgroundImage,
    };
  });
  // Glassmorphism is a standing ban, and this was the app's only blur.
  expect(years.filter === 'none' || years.filter === '').toBe(true);

  // The sticky lane label faded out behind a gradient of the old ground colour,
  // which let the bar underneath read straight through it.
  const lane = await page
    .locator('.tl__lanename')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(lane).toBe('none');
});

test('every bar says when, not only what', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);

  // The dates lived only in a `title` tooltip, invisible to keyboards, touch
  // and screen readers alike, on the one screen that exists to show dates.
  const bar = page.locator('.tl__bar').first();
  await expect(bar).toHaveAttribute('aria-label', /\d{4}-\d{2}-\d{2}( to (\d{4}-\d{2}-\d{2}|now))?/);
  await expect(bar).toHaveAttribute('aria-pressed', 'false');

  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');
});

test('an ongoing span says so in words, not only in colour', async ({ page }) => {
  await signIn(page);
  // The seed contains no open-ended span, so the state has to be made.
  const id = await createOngoingRole(page, `E2E ongoing ${Date.now()}`);
  try {
    await goTimeline(page);

    // "Still going" was a tint plus an inset ring and nothing else.
    const current = page.locator('.tl__bar--current').first();
    await expect(current).toBeVisible();
    await expect(current).toContainText('→ now');
    await expect(current).toHaveAttribute('aria-label', /to now$/);
  } finally {
    await deleteNode(page, id);
  }
});

/**
 * Press every lane toggle the toolbar will let go of. Which lanes are mounted
 * depends on what the graph holds, and the last one standing refuses, so this
 * asks each control rather than assuming a fixed set is there to press.
 */
async function switchOffEveryLaneThatWill(page: Page): Promise<void> {
  for (const name of ['Roles', 'Projects', 'Education', 'Events', 'Trips']) {
    const lane = page.getByRole('button', { name, exact: true }).first();
    if ((await lane.count()) && (await lane.isEnabled())) await lane.click();
  }
}

test('the last lane cannot be switched off, and says so rather than refusing silently', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);

  // At least one lane must stay on. That was enforced by putting the lane
  // straight back, so the button looked live and did nothing when pressed.
  await switchOffEveryLaneThatWill(page);

  const on = page.locator('[aria-label="Lanes"] .graph__filter--on');
  await expect(on).toHaveCount(1);
  await expect(on).toBeDisabled();
  await expect(page.locator('.tl__lane')).toHaveCount(1);
});

test('a failed load says so instead of reporting an empty life', async ({ page }) => {
  await signIn(page);
  await page.route(TIMELINE, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"the timeline service is down"}}',
    }),
  );
  await page.goto('/timeline');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('the timeline service is down');
  await expect(page.getByText('Nothing dated yet')).toHaveCount(0);
});

test('a failed season digest reports itself instead of looking un-brushed', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);

  await page.route(REVIEW, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"boom","message":"digest unavailable"}}',
    }),
  );

  // Brush a range across the track.
  const track = page.locator('.tl__track').first();
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  // `isError` was never read, so a failed digest fell back to the default
  // header and looked exactly like never having brushed at all.
  await expect(page.getByRole('alert')).toContainText("Couldn't summarise that range", { timeout: 10_000 });
});

test('nothing on the chronograph is set below the type scale', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);

  // Five rules sat under the 11px floor, 9px on the "now" pill, 10.5px on lane
  // names and bar labels, 10px on moment labels and the list toggle.
  const tooSmall = await page
    .locator('.chronograph__main *, .chronograph__chrome *')
    .evaluateAll((els) =>
      els
        .filter((el) => el.textContent?.trim())
        .map((el) => ({ px: parseFloat(getComputedStyle(el).fontSize), t: el.textContent!.trim().slice(0, 18) }))
        .filter((r) => r.px > 0 && r.px < 11),
    );
  expect(tooSmall).toEqual([]);
});

test('the chronograph has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await goTimeline(page);
  await expectNoA11yViolations(page);
});
