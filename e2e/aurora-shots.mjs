import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Screenshots land in the gitignored test-results dir unless overridden.
const OUT = process.env.SHOT_DIR ?? fileURLToPath(new URL('./test-results/aurora', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot -> ${name}.png`);
}

// Sign-in first (before auth)
const devBtn = page.getByRole('button', { name: /developer sign-in/i });
if (await devBtn.isVisible().catch(() => false)) {
  await shot('01-signin');
  await devBtn.click();
  await page.waitForTimeout(1600);
}

await shot('02-today');

const routes = [
  ['/people', '03-people'],
  ['/orgs', '04-orgs'],
  ['/graph', '05-graph'],
  ['/timeline', '06-timeline'],
  ['/map', '07-map'],
  ['/collections', '08-collections'],
  ['/import', '09-import'],
  ['/resume/tailor', '10-tailor'],
  ['/settings', '11-settings'],
  ['/ask/people', '12-ask'],
];
for (const [r, name] of routes) {
  await page.goto(`http://localhost:5173${r}`);
  await page.waitForTimeout(r === '/graph' ? 2600 : 1300);
  await shot(name);
}

// Person profile
await page.goto('http://localhost:5173/people');
await page.waitForTimeout(1200);
await page.getByText('Sarah Chen').first().click();
await page.waitForTimeout(1100);
await shot('13-person');

// New-entity menu + person form
await page.getByRole('button', { name: 'New record (n)' }).click();
await page.waitForTimeout(400);
await shot('14-new-menu');
await page.getByRole('menuitem', { name: 'person', exact: true }).click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(350);
await shot('15-person-form');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// QuickAdd (⌘K)
await page.keyboard.press('Control+k');
await page.waitForTimeout(450);
await shot('16-quickadd');
await page.keyboard.press('Escape');

await browser.close();
