/** Capture one surface against the disposable frontend-review stack. */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const route = process.argv[2];
const label = process.argv[3];
if (!route?.startsWith('/') || !/^[a-z0-9-]+$/.test(label ?? '')) {
  throw new Error('Usage: node scripts/review-screen.mjs /route surface-name');
}
const output = resolve('.review', label);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  const login = await context.request.post('http://127.0.0.1:4010/api/v1/auth/dev-login');
  if (!login.ok()) throw new Error(`Review sign-in failed: ${login.status()}`);
  const surface = process.argv[4];
  if (surface !== 'welcome') await context.addInitScript(() => localStorage.setItem('vitae.v1.welcomed', '1'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:5183${route}`);
  await page.locator('#main-content').waitFor();
  if (route === '/today' && surface !== 'welcome') await page.getByRole('img', { name: /^Days of this week/ }).waitFor();
  if (route === '/today/tasks') await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor({ timeout: 60000 });
  if (route === '/today/waiting') await page.getByRole('heading', { name: 'Waiting', exact: true }).waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  if (surface === 'welcome') await page.getByRole('dialog', { name: 'Welcome to Vitae' }).waitFor();
  if (surface === 'capture') await page.getByRole('button', { name: 'Quick capture', exact: true }).click();
  if (surface === 'switcher') await page.getByRole('button', { name: 'Search records or run a command' }).click();
  if (surface === 'reminders') await page.getByRole('button', { name: /^Reminders/ }).click();
  if (surface === 'appearance') await page.getByRole('button', { name: /^Appearance/ }).click();
  if (surface === 'new-menu') await page.getByRole('button', { name: 'New record (n)' }).click();
  if (surface === 'new-person') {
    await page.getByRole('button', { name: 'New record (n)' }).click();
    await page.getByRole('menuitem', { name: 'person', exact: true }).click();
    await page.getByRole('dialog', { name: 'New person' }).waitFor();
  }
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 834 ? 1112 : width === 390 ? 844 : 900 });
    const path = resolve(output, `${width}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    const state = await page.evaluate(() => ({
      heading: document.querySelector('#main-content h1')?.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent),
    }));
    console.log(JSON.stringify({ width, path, ...state }));
  }
  console.log(JSON.stringify({ errors: [...new Set(errors)] }));
} finally {
  await browser.close();
}
