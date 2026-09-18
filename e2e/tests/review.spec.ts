import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const summary = (period: string, bullets: string[], completeness = 'complete') => ({
  window: {
    days: period === 'weekly' ? 7 : 1,
    start: period === 'weekly' ? '2026-09-08' : '2026-09-14',
    end: '2026-09-14',
  },
  time_zone: 'America/Los_Angeles',
  completeness,
  review: { bullets },
});

test('Review does not present a pending or failed first load as empty', async ({ page }) => {
  await signIn(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = true;
  await page.route('**/api/v1/productivity/review?*', async (route) => {
    await pending;
    await route.fulfill(
      failed
        ? {
            status: 503,
            json: { error: { code: 'OFFLINE', message: 'Review temporarily offline' } },
          }
        : { json: summary('daily', ['2 tasks completed']) },
    );
  });
  await page.goto('/today/review');
  await expect(page.getByLabel('Loading review')).toBeVisible();
  await expect(page.getByText('Nothing recorded for this period')).toBeHidden();
  release();
  await expect(page.getByText("Couldn't load the review")).toBeVisible();
  await expect(page.getByText('Nothing recorded for this period')).toBeHidden();
  failed = false;
  await page.getByRole('button', { name: 'Refresh review' }).click();
  await expect(page.getByText('2 tasks completed')).toBeVisible();
});

test('Review daily and weekly accounts stay readable at three sizes', async ({ page }, info) => {
  test.setTimeout(90_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/v1/productivity/review?*', (route) =>
    route.fulfill({
      json: summary(
        new URL(route.request().url()).searchParams.get('period')!,
        [
          '12 tasks completed',
          '3 tasks are waiting',
          '2 follow-up dates are past',
          '7321 seconds recorded',
          '8 habit checks',
          '3 tasks in Do, 12 in Schedule, 2 in Delegate, 1 in Eliminate',
          '1 application in applied, 2 applications in screening, 3 applications in interview, 1 application in offer',
        ],
        'sparse',
      ),
    }),
  );
  await page.goto('/today/review');
  await expect(page.getByText('12 tasks completed')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const period of ['Daily', 'Weekly']) {
      await page.getByRole('button', { name: period, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Refresh review' })).toBeEnabled();
      await page
        .locator('#main-content')
        .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: info.outputPath(`review-${period}-${width}.png`),
        animations: 'disabled',
      });
      const last = page.getByRole('link', { name: 'Explore the figures' });
      await last.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await expect(last).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`review-${period}-lower-${width}.png`),
        animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expectNoA11yViolations(page, '.prod-review');
    }
  }
  expect(errors).toEqual([]);
});

test('Review period persists through reload and keyboard navigation leads to follow-ups', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/today/review?source=today');
  await page.getByRole('button', { name: 'Weekly', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/period=weekly/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Weekly', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Seven-day account')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('source')).toBe('today');
  await page.getByRole('link', { name: 'Review follow-ups' }).click();
  await expect(page).toHaveURL(/\/today\/waiting\?followup=due/);
  await expect(page.getByRole('heading', { name: 'Waiting', exact: true })).toBeVisible();
});

test('Review keeps missing history distinct from empty and recovers a failed refresh', async ({
  page,
}) => {
  await signIn(page);
  let state = 'unknown';
  await page.route('**/api/v1/productivity/review?*', (route) =>
    route.fulfill(
      state === 'failed'
        ? {
            status: 503,
            json: { error: { code: 'OFFLINE', message: 'Review temporarily offline' } },
          }
        : {
            json: summary(
              'daily',
              state === 'populated' ? ['4 tasks completed'] : [],
              state === 'unknown' ? 'unknown' : 'complete',
            ),
          },
    ),
  );
  await page.goto('/today/review');
  await expect(page.getByText('No measured facts available')).toBeVisible();
  await expect(page.getByText('History is incomplete')).toBeVisible();
  state = 'empty';
  await page.getByRole('button', { name: 'Refresh review' }).click();
  await expect(page.getByText('Nothing recorded for this period')).toBeVisible();
  state = 'populated';
  await page.getByRole('button', { name: 'Refresh review' }).click();
  await expect(page.getByText('4 tasks completed')).toBeVisible();
  state = 'failed';
  await page.getByRole('button', { name: 'Refresh review' }).click();
  await expect(page.getByText("Couldn't load the review")).toBeVisible();
  await expect(page.getByText('4 tasks completed')).toBeVisible();
  state = 'populated';
  await page.getByRole('button', { name: 'Refresh review' }).click();
  await expect(page.getByText("Couldn't load the review")).toBeHidden();
});
