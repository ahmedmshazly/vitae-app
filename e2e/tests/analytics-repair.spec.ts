import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const TITLE =
  'Prepare the community research partnership — accessible recruitment, participant interviews, shared findings and follow-up commitments';
function payload(days = 30, unknown = false) {
  const base = {
    history_completeness: 'complete',
    window_start: '2026-08-16',
    window_end: '2026-09-14',
    time_zone: 'UTC',
  };
  return {
    window: { days, start: '2026-08-16', end: '2026-09-14' },
    time_zone: 'UTC',
    completeness: unknown ? 'unknown' : 'complete',
    figures: {
      throughput: {
        ...base,
        history_completeness: unknown ? 'unknown' : 'complete',
        total: 8,
        by_day: [
          { period: '2026-09-12', count: 5 },
          { period: '2026-09-14', count: 3 },
        ],
      },
      urgency_creep: {
        ...base,
        history_completeness: unknown ? 'unknown' : 'complete',
        count: unknown ? 0 : 2,
      },
      estimates_vs_actuals: {
        ...base,
        rows: [{ task_id: 'analytics-task', effort_min: 90, actual_sec: 3661 }],
      },
      time_spent: {
        ...base,
        total_seconds: 3661,
        by_task: [{ task_id: 'analytics-task', seconds: 3661 }],
      },
      habits: {
        ...base,
        total_checks: 8,
        by_habit: [
          {
            habit_id: 'habit-one',
            title: 'Write a brief reflection on the day',
            checks: 8,
            current_run: 3,
          },
        ],
      },
      quadrant_balance: { ...base, do: 2, schedule: 8, delegate: 3, eliminate: 1 },
      waiting: { ...base, waiting: 3, overdue_follow_up: 5 },
      application_funnel: {
        ...base,
        rows: [
          { stage: 'applied', count: 3 },
          { stage: 'screening', count: 1 },
          { stage: 'interview', count: 2 },
        ],
      },
      goals: {
        ...base,
        rows: [
          {
            goal_id: 'goal-one',
            title: 'Publish the research findings with the community advisory group',
            tasks: 3,
          },
        ],
      },
      by_entity: {
        ...base,
        rows: [
          {
            entity_id: 'person-one',
            title: 'Alexandra Rivera — community research and accessibility coordinator',
            waiting_on: 2,
            for: 3,
          },
        ],
      },
    },
  };
}

test('Analytics individually renders every figure and comparison at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/api/v1/productivity/analytics?*', (route) =>
    route.fulfill({ json: payload() }),
  );
  await page.route('**/api/v1/productivity/tasks', (route) =>
    route.fulfill({ json: { tasks: [{ id: 'analytics-task', title: TITLE }] } }),
  );
  await page.goto('/today/analytics');
  await expect(
    page.getByRole('table', { name: 'Time spent', exact: true }).getByRole('link', { name: TITLE }),
  ).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`analytics-header-${width}.png`),
      animations: 'disabled',
    });
    for (const [group, titles] of [
      [
        'Activity',
        ['Throughput', 'Urgency after create', 'Estimates versus actuals', 'Time spent', 'Habits'],
      ],
      ['Current workload', ['Quadrant balance', 'Waiting', 'Application stages']],
      ['Connections', ['Goals', 'By person or organization']],
    ] as const) {
      await page.getByRole('button', { name: group, exact: true }).click();
      for (const title of titles) {
        const figure = page.getByRole('region', { name: title, exact: true });
        const disclosure = figure.locator('summary');
        await disclosure.focus();
        await page.keyboard.press('Enter');
        await expect(figure.getByRole('list', { name: `${title} chart` })).toBeVisible();
        await figure.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.screenshot({
          path: info.outputPath(
            `analytics-${title.toLowerCase().replaceAll(' ', '-')}-${width}.png`,
          ),
          animations: 'disabled',
        });
        expect(await figure.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(
          await page.evaluate(
            () => scrollY === 0 && document.documentElement.scrollHeight <= innerHeight,
          ),
        ).toBe(true);
        await expectNoA11yViolations(page, '.prod-analytics');
        await disclosure.click();
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

test('Analytics preserves URL choices, loads more rows and links records', async ({ page }) => {
  await signIn(page);
  const data = payload();
  data.figures.goals.rows = Array.from({ length: 21 }, (_, i) => ({
    goal_id: `goal-${i}`,
    title: `Research goal ${i}`,
    tasks: i,
  }));
  await page.route('**/api/v1/productivity/analytics?*', (route) => route.fulfill({ json: data }));
  await page.goto('/today/analytics?window=90&view=connections&source=review');
  await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Research goal 20', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show more goals' }).click();
  await expect(page.getByRole('link', { name: 'Research goal 20', exact: true })).toHaveAttribute(
    'href',
    '/n/goal-20',
  );
  await page.getByRole('button', { name: '365 days' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '365 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Connections', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(new URL(page.url()).searchParams.get('source')).toBe('review');
});

test('Analytics handles name failure and unknown history without losing measured figures', async ({
  page,
}) => {
  await signIn(page);
  let failNames = true;
  let failFigures = false;
  await page.route('**/api/v1/productivity/analytics?*', (route) =>
    route.fulfill(
      failFigures
        ? { status: 503, json: { error: { code: 'OFFLINE', message: 'Figures offline' } } }
        : { json: payload(30, true) },
    ),
  );
  await page.route('**/api/v1/productivity/tasks', (route) =>
    route.fulfill(
      failNames
        ? { status: 503, json: { error: { code: 'OFFLINE', message: 'Names offline' } } }
        : { json: { tasks: [{ id: 'analytics-task', title: TITLE }] } },
    ),
  );
  await page.goto('/today/analytics');
  await expect(page.getByText('Task names unavailable')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Throughput', exact: true })).toBeHidden();
  await expect(page.getByRole('table', { name: 'Urgency after create', exact: true })).toBeHidden();
  await expect(page.getByText('Not measured: revision history is incomplete.')).toHaveCount(2);
  failNames = false;
  await page.getByRole('button', { name: 'Retry task names' }).click();
  const time = page.getByRole('table', { name: 'Time spent', exact: true });
  await expect(time.getByRole('link', { name: TITLE })).toBeVisible();
  failFigures = true;
  await page.getByRole('button', { name: 'Refresh figures' }).click();
  await expect(page.getByText("Couldn't load analytics")).toBeVisible();
  await expect(time).toBeVisible();
  failFigures = false;
  await page.getByRole('button', { name: 'Refresh figures' }).click();
  await expect(page.getByText("Couldn't load analytics")).toBeHidden();
});

test('Analytics reads real windows and returns to the short review', async ({ page }) => {
  await signIn(page);
  await page.goto('/today/analytics');
  await expect(page.getByRole('heading', { name: 'Throughput', exact: true })).toBeVisible();
  for (const days of ['30', '90', '365']) {
    await page.getByRole('button', { name: `${days} days` }).click();
    await expect(page.getByRole('button', { name: 'Refresh figures' })).toBeEnabled();
    await expect(page.getByText("Couldn't load analytics")).toBeHidden();
    await expect(page.locator('.prod-analytics-window time')).toHaveCount(2);
  }
  await page.getByRole('button', { name: 'Current workload' }).click();
  await page
    .getByRole('table', { name: 'Waiting', exact: true })
    .getByRole('link', { name: 'Waiting', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Waiting', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Current workload' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Open a short review' }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
});
