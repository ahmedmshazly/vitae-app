import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('Person correspondence opens every evidence register, retains cached data and recovers', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Correspondence review ${Date.now()}`,
      props: {},
    }),
    'Create scratch person',
  );
  const ids = Array.from(
    { length: 25 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`,
  );
  // Named fictional history exercises long registers without changing personal data.
  await page.route(`**/api/v1/nodes/${person.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    ids.forEach((id, i) => {
      body.edges.push({ id: `review-edge-${i}`, type: 'WITH', src: id, dst: person.id, props: {} });
      body.neighbors[id] = {
        id,
        type: 'interaction',
        title: `Fictional research correspondence ${i + 1}: accessibility and community partnerships`,
        props: {
          kind: 'email',
          occurred_at: `2026-08-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
        },
      };
    });
    await route.fulfill({ response, json: body });
  });
  const data = {
    profile: {
      coverage: { withDirection: 24, total: 25 },
      reciprocity: {
        outbound: 12,
        inbound: 12,
        ratio: 0.5,
        outboundIds: ids.slice(0, 12),
        inboundIds: ids.slice(12, 24),
      },
      replyLatency: {
        mine: { medianDays: 1, samples: [{ fromId: ids[0], toId: ids[1], days: 1 }] },
        theirs: { medianDays: null, samples: [] },
      },
      unansweredInbound: { count: 2, eventIds: ids.slice(22, 24) },
      contactDays: { totalDays: 25, months: [{ month: '2026-08', days: 25 }] },
    },
    introductions: {
      connected: [
        {
          edgeId: 'intro-1',
          otherId: person.id,
          otherTitle: 'Fictional community partnerships collaborator',
          viaId: null,
          viaLabel: 'Shared research workshop',
          occurredOn: '2026-08-15',
          context: 'Connected to discuss accessible public services and follow-up research.',
        },
      ],
      brokered: [
        {
          edgeId: 'intro-2',
          srcId: person.id,
          srcTitle: 'Fictional researcher',
          dstId: person.id,
          dstTitle: 'Fictional research partner',
          occurredOn: '2026-08-18',
          context: 'Introduced for a shared project.',
        },
      ],
    },
  };
  let failed = false;
  await page.route(`**/api/v1/people/${person.id}/correspondence`, (route) =>
    route.fulfill(
      failed ? { status: 503, json: { error: 'Review refresh failure' } } : { json: data },
    ),
  );
  await page.goto(`/network/people/${person.id}`);
  const panel = page.locator('.correspondence-panel');
  await expect(panel.getByText('Reciprocity', { exact: true })).toBeVisible();
  const labels = [
    'Reciprocity',
    'Reply latency',
    'Unanswered inbound',
    'Contact days',
    'Introductions',
  ];
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const label of labels) {
      const summary = panel.locator('summary').filter({ hasText: label });
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(summary.locator('..')).toHaveAttribute('open', '');
      await summary.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -130));
      await expectNoA11yViolations(page, '.correspondence-panel');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(
          `correspondence-${label.toLowerCase().replaceAll(' ', '-')}-${width}.png`,
        ),
        animations: 'disabled',
      });
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(summary.locator('..')).not.toHaveAttribute('open', '');
    }
  }
  await panel.getByText('Reciprocity', { exact: true }).click();
  const evidence = panel.getByRole('list', { name: 'Reciprocity evidence' });
  await expect(evidence.getByRole('listitem')).toHaveCount(20);
  await panel.getByRole('button', { name: 'Show more reciprocity' }).click();
  await expect(evidence.getByRole('listitem')).toHaveCount(24);
  await expect(evidence.getByRole('link').first()).toHaveAttribute('href', `/n/${ids[0]}`);
  failed = true;
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(panel.getByText('Correspondence could not be refreshed')).toBeVisible();
  await expect(evidence.getByRole('listitem')).toHaveCount(24);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await panel
      .getByText('Correspondence could not be refreshed')
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -130));
    await page.screenshot({
      path: info.outputPath(`correspondence-cached-${width}.png`),
      animations: 'disabled',
    });
  }
  failed = false;
  await panel.getByRole('button', { name: 'Retry correspondence' }).click();
  await expect(panel.getByText('Correspondence could not be refreshed')).toBeHidden();
  await expect(evidence.getByRole('listitem')).toHaveCount(24);
  expect(errors).toEqual([]);
});

test('Person correspondence distinguishes empty, directionless and failed responses', async ({
  page,
}) => {
  await signIn(page);
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Empty correspondence ${Date.now()}`,
      props: {},
    }),
    'Create scratch person',
  );
  let mode: 'failed' | 'missing' | 'empty' | 'directionless' = 'failed';
  await page.route(`**/api/v1/people/${person.id}/correspondence`, (route) => {
    if (mode === 'failed') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    if (mode === 'missing') return route.fulfill({ json: {} });
    return route.fulfill({
      json: {
        profile: { coverage: { total: mode === 'empty' ? 0 : 2, withDirection: 0 } },
        introductions: {
          connected: [
            {
              edgeId: 'intro',
              otherId: person.id,
              otherTitle: 'Fictional colleague',
              viaId: null,
              viaLabel: null,
              occurredOn: null,
              context: null,
            },
          ],
          brokered: [],
        },
      },
    });
  });
  await page.goto(`/network/people/${person.id}`);
  await expect(page.getByText('Correspondence unavailable')).toBeVisible();
  mode = 'missing';
  await page.getByRole('button', { name: 'Retry correspondence' }).click();
  await expect(page.getByText('Correspondence unavailable')).toBeVisible();
  mode = 'empty';
  await page.getByRole('button', { name: 'Retry correspondence' }).click();
  const panel = page.locator('.correspondence-panel');
  await expect(panel.getByText('No interactions logged')).toBeVisible();
  await panel.getByText('Introductions', { exact: true }).click();
  await expect(panel.getByRole('link', { name: 'Fictional colleague' })).toHaveAttribute(
    'href',
    `/network/people/${person.id}`,
  );
  mode = 'directionless';
  await page.reload();
  await expect(panel.getByText('No stated directions yet')).toBeVisible();
  await expect(panel.getByText('Reciprocity', { exact: true })).toHaveCount(0);
});
