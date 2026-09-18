import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

const URL = '/network/intelligence?lens=contact';
const lead = 'Fictional contact Amara Chen — community research and international partnerships';
const result = {
  id: 'contact-review-p1',
  title: lead,
  headline: 'Research lead · accessible public services',
  city: 'Alexandria',
  score: 2.2,
  chips: [
    { factor: 'strength', raw: 1, weighted: 1.2 },
    { factor: 'graph', raw: 1, weighted: 1.1 },
    { factor: 'reciprocity', raw: -1, weighted: -0.1 },
  ],
  topEvidence: [],
  pack: {
    interactions: [
      {
        id: 'ix-review',
        title: 'Fictional workshop: accessible community services and research priorities',
        kind: 'meeting',
        date: '2026-09-01',
      },
    ],
    followUps: [
      {
        what: 'Share the workshop notes and review the next research proposal together.',
        due: '2026-09-22',
      },
    ],
    shared: [
      { id: 'org-review', title: 'Fictional Community Research Cooperative', type: 'organization' },
    ],
    topics: ['Community accessibility', 'Research partnerships'],
  },
};
const second = {
  ...result,
  id: 'contact-review-p2',
  title: 'Fictional contact Sam Rivera',
  score: 1.5,
  chips: [{ factor: 'topic', raw: 1, weighted: 1.5 }],
  topEvidence: ['community research'],
  pack: undefined,
};
async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  selector = '.page--contact-ranking',
  widths = [1440, 834, 390],
) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const pane = element.closest('.vt-modal__body') ?? element.closest('main');
        if (pane)
          pane.scrollBy({
            top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 20,
            behavior: 'instant',
          });
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    await expectNoA11yViolations(page, selector);
    if (name === 'interaction-logger') {
      const heights = await page
        .locator('.interaction-logger .vt-filters__opt')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      expect(heights).toHaveLength(8);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(width <= 640 ? 44 : 32);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}
async function fixture(page: Page) {
  await page.route('**/api/v1/ask/history', (route) =>
    route.fulfill({
      json: {
        asks: [
          {
            label: 'referral about community research',
            intent: { need: 'referral', terms: ['community research'], city: 'Alexandria' },
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/ask/people', (route) =>
    route.fulfill({ json: { results: [result, second] } }),
  );
}

test('Contact query, history, evidence and recovery remain coherent across viewports', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  await page.goto(URL);
  await expect(page.getByText('Nothing asked yet')).toBeVisible();
  await capture(page, info, 'initial');
  await page
    .getByRole('button', { name: 'referral about community research · in Alexandria' })
    .click();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Alexandria');
  await expect(page.getByText('The first contact has no request-specific match')).toBeVisible();
  await capture(page, info, 'ranked-query');
  await capture(page, info, 'ranked-results', '.network-result');
  const first = page.locator('.network-result').first();
  await first.getByRole('button', { name: /Open contact dossier/ }).focus();
  await page.keyboard.press('Enter');
  await expect(first.getByText('Why this rank')).toBeVisible();
  await capture(page, info, 'dossier-factors', '.network-factor-evidence');
  await capture(page, info, 'dossier-records', '.network-result__detail .vt-section');
  await expect(
    first.getByRole('link', { name: 'Fictional Community Research Cooperative' }),
  ).toHaveAttribute('href', '/network/organizations/org-review');
  await first.getByRole('button', { name: /Close contact dossier/ }).click();
  await page.getByLabel('City', { exact: true }).fill('Cairo');
  await expect(page.getByText('Your changes have not been ranked yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Rank contacts' }).click();
  await expect(page).toHaveURL(/city=Cairo/);
  await page.goBack();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Alexandria');
  await page.goForward();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Cairo');
  await page.reload();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Cairo');
  await page.route('**/api/v1/ask/people', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'unavailable', message: 'Fictional ranking service interruption' } },
    }),
  );
  await page.getByRole('button', { name: 'Rank contacts' }).click();
  await expect(page.getByText('The latest ranking could not be loaded')).toBeVisible();
  await expect(page.getByText(lead, { exact: true })).toBeVisible();
  await capture(page, info, 'cached-error', '.network-secondary-state', [390]);
  await page.goto(`${URL}&topics=malformed`);
  await expect(page.getByText("Couldn't rank anyone")).toBeVisible();
  await capture(page, info, 'ranking-error', '.page--contact-ranking', [1440]);
  await page.route('**/api/v1/ask/people', (route) => route.fulfill({ json: { results: [] } }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No one to call')).toBeVisible();
  await capture(page, info, 'empty', '.page--contact-ranking .vt-empty', [390]);
  expect(errors).toEqual([]);
});

test('Composer protects text, explains logging, supports copying and recovers from failures', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  let draftFailure = true;
  let delayDraft = false;
  let releaseDraft = () => {};
  await page.route('**/api/v1/composer/draft', async (route) => {
    if (delayDraft)
      await new Promise<void>((resolve) => {
        releaseDraft = resolve;
      });
    return draftFailure
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: 'unavailable', message: 'Fictional drafting service interruption' },
          },
        })
      : route.fulfill({
          json: {
            body: `Hello Amara,\n\nI enjoyed our workshop on accessible services. Could you introduce me to the team working on community research?\n\nI can send a short summary of the proposal. Thank you.`,
            facts: [
              'Fictional workshop on accessible community research services',
              'Recorded research partnership',
            ],
          },
        });
  });
  let logFailure = true;
  let logs = 0;
  await page.route('**/api/v1/composer/send', (route) => {
    logs += 1;
    return logFailure
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', message: 'Fictional confirmation unavailable' } },
        })
      : route.fulfill({ json: { interaction: { id: 'ix' }, reminderId: 'reminder' } });
  });
  await page.goto(`${URL}&topics=community+research&org=Fictional+Research+Cooperative`);
  await page
    .locator('.network-result')
    .first()
    .getByRole('button', { name: /Open contact dossier/ })
    .click();
  const opener = page.getByRole('button', { name: 'Draft the ask' });
  await opener.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog.getByText("Couldn't draft that message")).toBeVisible();
  await capture(page, info, 'composer-initial-error', '[role="dialog"]', [390]);
  draftFailure = false;
  delayDraft = true;
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByText('Assembling the draft')).toBeVisible();
  await capture(page, info, 'composer-pending', '[role="dialog"]', [1440]);
  releaseDraft();
  delayDraft = false;
  await expect(dialog.getByLabel('Draft message')).toBeVisible();
  await capture(page, info, 'composer-ready', '[role="dialog"]');
  await capture(page, info, 'composer-editor', '.outreach-composer textarea', [390]);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Hello Amara');
  // The dialog owns pointer focus; let this transient announcement expire.
  await expect(page.locator('.toast').filter({ hasText: 'Copied draft to clipboard' })).toHaveCount(
    0,
    { timeout: 15000 },
  );
  await dialog
    .getByLabel('Draft message')
    .fill('Fictional custom request. Please keep my edits after failure.');
  await dialog.getByRole('button', { name: 'formal', exact: true }).click();
  await expect(dialog.getByLabel('Draft message')).toHaveValue(
    'Fictional custom request. Please keep my edits after failure.',
  );
  await page.keyboard.press('Escape');
  const discard = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(discard.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await capture(page, info, 'composer-discard', '[role="dialog"]:last-of-type', [390]);
  await discard.getByRole('button', { name: 'Keep editing' }).click();
  await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
  const replacement = page.getByRole('dialog', { name: 'Replace your edited draft?' });
  await expect(replacement.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  draftFailure = true;
  await replacement.getByRole('button', { name: 'Replace draft' }).click();
  await expect(dialog.getByText("Couldn't regenerate the draft")).toBeVisible();
  await expect(dialog.getByLabel('Draft message')).toHaveValue(
    'Fictional custom request. Please keep my edits after failure.',
  );
  await capture(page, info, 'composer-regenerate-error', '[role="dialog"]', [390]);
  await dialog.getByRole('checkbox', { name: 'I have sent this message outside Vitae' }).check();
  await dialog.getByRole('button', { name: 'Log outreach & follow-up' }).click();
  await expect(dialog.getByText('Outreach logging was not confirmed')).toBeVisible();
  await capture(page, info, 'composer-logging-error', '[role="dialog"]');
  logFailure = false;
  await dialog.getByRole('button', { name: 'Retry logging' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(logs).toBe(2);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('Contact actions create an interaction and seven-day follow-up on the scratch API', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const { node } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional contact workflow ${Date.now()}`,
      props: { city: 'Alexandria' },
    }),
    'create scratch contact',
  );
  await page.route('**/api/v1/ask/history', (route) => route.fulfill({ json: { asks: [] } }));
  await page.route('**/api/v1/ask/people', (route) =>
    route.fulfill({
      json: { results: [{ ...result, id: node.id, title: 'Fictional workflow contact' }] },
    }),
  );
  await page.goto(`${URL}&run=1`);
  await page.getByRole('button', { name: /Open contact dossier/ }).click();
  await page.getByRole('button', { name: 'Log outreach', exact: true }).click();
  const logger = page.getByRole('dialog');
  await capture(page, info, 'interaction-logger', '[role="dialog"]');
  await logger
    .getByLabel('What happened?', { exact: false })
    .fill('Fictional browser verification: research workshop follow-up.');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/interactions') && response.request().method() === 'POST',
  );
  await logger.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(logger).toHaveCount(0);
  await page.getByRole('button', { name: 'Draft the ask' }).click();
  const composer = page.getByRole('dialog');
  await expect(composer.getByLabel('Draft message')).toBeVisible();
  await composer.getByRole('checkbox').check();
  const logged = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/composer/send') && response.request().method() === 'POST',
  );
  await composer.getByRole('button', { name: 'Log outreach & follow-up' }).click();
  const response = await logged;
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.interaction.id).toBeTruthy();
  expect(data.reminderId).toBeTruthy();
  const days = (new Date(data.followUpOn).getTime() - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(6);
  expect(days).toBeLessThanOrEqual(7);
  await expect(composer).toHaveCount(0);
  const savedInteraction = await expectOkJson<{ node: { id: string } }>(
    await apiGet(page, `/nodes/${data.interaction.id}`),
    'read logged outreach',
  );
  expect(savedInteraction.node.id).toBe(data.interaction.id);
});
