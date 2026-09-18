import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

test('Contact help, request selector and delayed ranking support keyboard use', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await signIn(page);
  await page.route('**/api/v1/ask/history', (route) => route.fulfill({ json: { asks: [] } }));
  let release = () => {};
  await page.route('**/api/v1/ask/people', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: { results: [] } });
  });
  await page.goto('/network/intelligence?lens=contact');
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const help = page.getByRole('button', { name: 'How this works' });
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('How ranking works', { exact: true })).toBeVisible();
    await expect(page.locator('.vt-info__title')).toHaveCSS('font-family', /Space Grotesk/);
    await expect(page.getByText(/Deductions are listed separately below the bar/)).toBeVisible();
    await expectNoA11yViolations(page, '.vt-popover');
    await page.screenshot({
      path: info.outputPath(`ranking-help-${width}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
    const request = page.getByRole('combobox', { name: 'I need', exact: true });
    await request.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(5);
    const heights = await options.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    );
    // Chromium can report 32px as 31.99997px after the menu transform settles.
    for (const height of heights) {
      expect(Math.round(height * 100) / 100).toBeGreaterThanOrEqual(width === 390 ? 44 : 32);
    }
    await page.keyboard.press('Escape');
    await expect(request).toBeFocused();
  }
  const need = page.getByRole('combobox', { name: 'I need', exact: true });
  await need.click();
  await expect(page.getByRole('option', { name: 'advice', exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('request-options-390.png'),
    animations: 'disabled',
  });
  await page.getByRole('option', { name: 'advice', exact: true }).click();
  await expect(need).toContainText('advice');
  await page.getByRole('button', { name: 'Rank contacts' }).click();
  await expect(page).toHaveURL(/need=advice/);
  await expect(page.getByRole('button', { name: 'Ranking…' })).toBeDisabled();
  await expect(page.getByLabel('Ranking contacts')).toBeVisible();
  release();
  await expect(page.getByText('No one to call')).toBeVisible();
});
