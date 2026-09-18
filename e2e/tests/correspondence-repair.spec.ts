import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const rollup = {
  candidates: [
    {
      person: { id: 'reconnect-tarek', title: 'Tarek Aziz', type: 'person' },
      score: 0.71,
      peak_strength: 0.71,
      peak_at: '2025-03-14T00:00:00.000Z',
      current_strength: 0.31,
      days_since_last: 210,
      factors: { closeness: 0.36, intensity: 0.35 },
    },
    {
      person: { id: 'reconnect-mina', title: 'Mina Aref', type: 'person' },
      score: 0.56,
      peak_strength: 0.62,
      peak_at: '2025-06-03T00:00:00.000Z',
      current_strength: 0.27,
      days_since_last: 96,
      factors: { closeness: 0.31, intensity: 0.25 },
    },
  ],
  considered_dormant: 7,
  brokers: [{ via: 'Alexandria Design Week', count: 2 }],
  introduced_brokers: [
    { via: 'broker-1', person_id: 'broker-1', label: 'Rana Broker', count: 1, edge_ids: ['e1'] },
  ],
  out_of_balance: [
    {
      person: { id: 'reconnect-tarek', title: 'Tarek Aziz', type: 'person' },
      ratio: 1,
      outbound: 5,
      inbound: 0,
      unanswered_inbound: 1,
    },
  ],
};

test('Correspondence makes a considered reconnect action usable across screen sizes', async ({
  page,
}, info) => {
  await signIn(page);
  await page.route('**/api/v1/correspondence', (route) => route.fulfill({ json: rollup }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/network/correspondence');
  await expect(page.getByRole('heading', { name: 'Correspondence' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Reactivation queue' })).toContainText(
    'priority score',
  );
  await expect(page.getByRole('button', { name: 'Log reconnection' }).first()).toBeVisible();
  await expectNoA11yViolations(page, '.page--correspondence');
  await page.screenshot({
    path: info.outputPath('correspondence-1440.png'),
    animations: 'disabled',
  });

  await page.getByRole('button', { name: '180+ days quiet' }).click();
  await expect(page.getByRole('link', { name: 'Tarek Aziz' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mina Aref' })).toHaveCount(0);
  await page.getByLabel('Filter reactivation queue').fill('no match');
  await expect(page.getByText('No reactivation candidates match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: 'Mina Aref' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const reconnect = page.getByRole('button', { name: 'Log reconnection' }).first();
  await page.screenshot({
    path: info.outputPath('correspondence-390.png'),
    animations: 'disabled',
  });
  await reconnect.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Log interaction · Tarek Aziz');
  await expectNoA11yViolations(page, '[role="dialog"]');
  await page.screenshot({
    path: info.outputPath('correspondence-log-390.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(reconnect).toBeFocused();
});
