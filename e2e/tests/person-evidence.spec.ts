import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('Person source evidence preserves context, bounds long lists and recovers refresh failures', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Source evidence review ${Date.now()}`,
      props: {},
    }),
    'Create scratch person',
  );
  const source = {
    title:
      'Fictional research workshop — accessible community services and international partnerships',
    kind: 'message',
    direction: 'in',
    occurred_at: '2026-08-15T09:00:00Z',
    locator: `mailbox:research-workshop/${'long-source-locator-'.repeat(8)}`,
  };
  const data = {
    assertions: Array.from({ length: 23 }, (_, i) => ({
      id: `review-assertion-${i}`,
      field: i === 0 ? 'props.headline' : '$record',
      value: 'Researcher',
      status: i === 1 ? 'proposed' : 'accepted',
      basis: 'explicit',
      confidence: 0.9,
      valid_from: '2026-08-15T09:00:00Z',
      reason: 'This fictional fixture records the stated role in a workshop follow-up.',
      citation: {
        locator: source.locator,
        excerpt: 'I lead research into accessible services and community partnerships.',
        record_id: i === 1 ? 'missing-source' : 'review-source',
      },
    })),
    records: { 'review-source': source },
  };
  let mode: 'loaded' | 'failed' | 'missing' | 'empty' = 'loaded';
  await page.route(`**/api/v1/knowledge/entities/${person.id}/evidence`, (route) => {
    if (mode === 'failed')
      return route.fulfill({ status: 503, json: { error: 'Review evidence unavailable' } });
    return route.fulfill({
      json: mode === 'empty' ? { assertions: [] } : mode === 'missing' ? {} : data,
    });
  });
  await page.goto(`/network/people/${person.id}`);
  const region = page.getByRole('region', { name: /^Evidence/ });
  const list = region.getByRole('list', { name: 'Evidence supporting this record' });
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(region.getByRole('link', { name: 'Open knowledge ledger' })).toHaveAttribute(
    'href',
    '/data/knowledge',
  );
  const first = list.getByRole('listitem').first();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const summary = first.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(first.getByText(source.title)).toBeVisible();
    await first.evaluate((element) => {
      const pane = element.closest('main');
      if (!pane) throw new Error('Missing app content pane');
      pane.scrollBy({
        top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 32,
        behavior: 'instant',
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect(first.getByText(source.title)).toBeInViewport();
    await expectNoA11yViolations(page, '.entity-evidence');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`source-details-${width}.png`),
      animations: 'disabled',
    });
    await summary.focus();
    await page.keyboard.press('Enter');
  }
  await list.getByRole('listitem').nth(1).locator('summary').click();
  await expect(
    region.getByText('Source metadata is unavailable. The citation above is retained.'),
  ).toBeVisible();
  await region.getByRole('button', { name: 'Show more evidence' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(23);
  await region.getByRole('button', { name: 'Show first 20 assertions' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  mode = 'failed';
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(region.getByText('Evidence could not be refreshed')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await region.evaluate((element) => {
      const pane = element.closest('main');
      if (!pane) throw new Error('Missing app content pane');
      pane.scrollBy({
        top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 32,
        behavior: 'instant',
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect(region.getByText('Evidence could not be refreshed')).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`source-cached-${width}.png`),
      animations: 'disabled',
    });
  }
  mode = 'loaded';
  await region.getByRole('button', { name: 'Retry evidence' }).click();
  await expect(region.getByText('Evidence could not be refreshed')).toBeHidden();
  mode = 'failed';
  await page.reload();
  await expect(region.getByText('Evidence unavailable')).toBeVisible();
  mode = 'missing';
  await region.getByRole('button', { name: 'Retry evidence' }).click();
  await expect(region.getByText('Evidence unavailable')).toBeVisible();
  mode = 'empty';
  await region.getByRole('button', { name: 'Retry evidence' }).click();
  await expect(region.getByText('No source assertions support this record yet.')).toBeVisible();
  await region.getByRole('link', { name: 'Open knowledge ledger' }).click();
  await expect(page).toHaveURL(/\/data\/knowledge$/);
  expect(errors).toEqual([]);
});
