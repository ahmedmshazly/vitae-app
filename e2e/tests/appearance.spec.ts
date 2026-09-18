import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

test('an explicit appearance matching the system still persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', contrast: 'no-preference' });
  await signIn(page);
  await page.getByRole('button', { name: 'Appearance: System' }).click();
  await page.getByRole('menuitemradio', { name: /^Light/ }).click();
  await expect(page.getByRole('button', { name: 'Appearance: Light' })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('vitae.theme'))).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Appearance: Light' })).toBeVisible();
});

test('system appearance restores device tracking with keyboard and focus return', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference' });
  await signIn(page);
  const trigger = page.getByRole('button', { name: /^Appearance:/ });
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: /^System/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: /^High contrast/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'hc');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: /^High contrast/ })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('vitae.theme'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'hc');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Appearance: System' })).toBeVisible();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Appearance', exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('appearance remains legible across themes and screen sizes', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await signIn(page);
  for (const theme of [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }, { label: 'High contrast', value: 'hc' }]) {
    const trigger = page.getByRole('button', { name: /^Appearance:/ });
    await trigger.click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${theme.label}`) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.value);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Appearance', exact: true });
    for (const width of [1440, 834, 390]) {
      await page.setViewportSize({ width, height: width === 834 ? 1112 : width === 390 ? 844 : 900 });
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expectNoA11yViolations(page, '.vt-popover');
      await page.screenshot({ path: testInfo.outputPath(`${theme.value}-${width}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Quick capture', exact: true }).click();
    await expectNoA11yViolations(page, '.vt-palette');
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('the shell search and utility controls do not overlap at intermediate widths', async ({ page }) => {
  await signIn(page);
  for (const route of ['/today', '/today/planner']) {
  await page.goto(route);
  for (const width of [1440, 1280, 1100, 1024, 834, 700, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const search = await page.getByRole('button', { name: 'Search records or run a command' }).boundingBox();
    const actions = await page.locator('.topbar__actions').boundingBox();
    expect(search!.x + search!.width, `Search overlaps utilities at ${width}px`).toBeLessThanOrEqual(actions!.x);
    expect(actions!.x + actions!.width, `Utilities overflow at ${width}px`).toBeLessThanOrEqual(width);
    expect(await page.locator('.topbar__crumb .cur').evaluate((node) => node.scrollWidth <= node.clientWidth), `Current location clipped at ${width}px`).toBe(true);
  }
  }
});
