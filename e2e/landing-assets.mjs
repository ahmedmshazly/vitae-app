import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Regenerate Quiet marketing screenshots into apps/web/public/landing/.
 *
 * Requires the seeded stack (dev:db, API, web) with AUTH_ENABLE_DEV_LOGIN.
 * Default web origin follows E2E_BASE_URL, else http://localhost:5173.
 */
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT =
  process.env.OUT_DIR ?? fileURLToPath(new URL('../apps/web/public/landing', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/signin`);
await page.evaluate(() => localStorage.setItem('vitae.v1.welcomed', '1'));
const devBtn = page.getByRole('button', { name: /developer sign-in/i });
await devBtn.waitFor({ state: 'visible', timeout: 10_000 });
await devBtn.click();
await page.getByRole('img', { name: /^Days of this week/ }).waitFor({ timeout: 15_000 });
await page.waitForTimeout(1500);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot -> ${name}.png`);
}

await shot('today');

// The canonical route, not the legacy /people alias, and the row's own link
// rather than a class name the stylesheet is free to rename.
await page.goto(`${BASE}/network/people`);
const sarah = page.getByRole('link', { name: /Sarah Chen/ }).first();
await sarah.waitFor({ timeout: 10_000 });
const sarahHref = await sarah.getAttribute('href');
if (!sarahHref) throw new Error('seed has no person named Sarah Chen');
await page.goto(sarahHref.startsWith('http') ? sarahHref : `${BASE}${sarahHref}`);
await page.getByRole('heading', { name: 'Sarah Chen' }).waitFor({ timeout: 10_000 });
await page.waitForTimeout(1200);
await shot('person');

await page.keyboard.press('Meta+k');
const capture = page.getByRole('textbox', { name: 'Capture line' });
await capture.waitFor({ state: 'visible', timeout: 5000 });
await capture.fill('p Lina Farouk @@DevFest #ml > met at the speaker dinner');
await page.waitForTimeout(600);
await shot('capture');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.goto(`${BASE}/explore/graph`);
await page.waitForTimeout(3000);
await shot('graph');

await page.goto(`${BASE}/`);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'New record (n)' }).click();
await page.getByRole('menuitem', { name: 'person', exact: true }).click();
await page.getByRole('dialog').waitFor();
await page.getByLabel('Full name').fill('Nadia Farouk');
await page.getByLabel('Headline').fill('Robotics researcher: perception');
await page.getByLabel('City').fill('Berlin');
await page.waitForTimeout(400);
await shot('form');
await page.keyboard.press('Escape');

await browser.close();
console.log(`Landing assets written to ${OUT}`);
