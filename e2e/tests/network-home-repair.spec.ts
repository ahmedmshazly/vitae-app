import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

test('Network home and its person entry stay readable and keyboard accessible at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/network');
  await expect(page.getByRole('heading', { name: 'Network', exact: true })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator('#main-content')
      .evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`network-top-${width}.png`),
      animations: 'disabled',
    });
    const last = page
      .getByRole('list', { name: 'Network discovery' })
      .getByRole('link', { name: /^Correspondence/ });
    await last.focus();
    await last.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(last).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`network-lower-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.network-home');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Add person', exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New person', exact: true });
    await expect(dialog.getByLabel('Full name')).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`network-person-${width}.png`),
      animations: 'disabled',
    });
    await dialog
      .locator('.vt-modal__body')
      .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`network-person-lower-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.vt-modal');
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add person', exact: true })).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('Network home destinations navigate and browser Back returns to the directory', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page);
  const destinations = [
    ['People', '/network/people'],
    ['Organizations', '/network/organizations'],
    ['Review relationships to revisit', '/network/people?filter=decaying'],
    ['Who should I contact?', '/network/intelligence?lens=contact'],
    ['Find a warm path', '/network/intelligence?lens=reach'],
    ['Correspondence', '/network/correspondence'],
  ];
  await page.goto('/network');
  for (const [name, path] of destinations) {
    const link = page
      .locator('.network-home')
      .getByRole('link', { name: new RegExp(`^${name!.replace(/[?]/g, '\\?')}`) });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL(path!, 'http://127.0.0.1:5183').href);
    await expect(page.locator('#main-content h1')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Network', exact: true })).toBeVisible();
  }
});

test('Network home creates a real person and keeps an unsaved draft until explicitly discarded', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/network');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  const name = `Network review partner ${Date.now()}`;
  await page.getByLabel('Full name').fill(name);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Create person', exact: true }).click();
  await expect(page).toHaveURL(/\/network\/people\//);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
});
