import { test, expect, type Page } from '@playwright/test';
import { apiPatch } from './helpers/api.js';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';
import { toast } from './helpers/toast';

/**
 * Screen 22: Templates.
 *
 * The build service returns `ok` once Tectonic has at least one warmed
 * template. The old screen read that as "all layouts calibrated and ready",
 * which is a stronger claim than the API makes. The gallery also degraded a
 * failed request into a blank list and silently completed the only write.
 */
const TEMPLATES = '**/api/v1/resumes/templates';

type Template = {
  key: string;
  name: string;
  version: string;
  ats_strict: boolean;
  description: string;
  traits: string[];
  page_size: string;
  accent_options: string[];
  line_model: {
    chars_per_line: number;
    lines_per_page: number;
    entry_overhead: number;
    section_overhead: number;
  };
};

const template = (over: Partial<Template> = {}): Template => ({
  key: 'cobalt',
  name: 'Cobalt',
  version: '1.0.0',
  ats_strict: false,
  description: 'A compact, readable layout.',
  traits: ['balanced', 'compact'],
  page_size: 'A4',
  accent_options: ['#2563eb', '#0f766e'],
  line_model: { chars_per_line: 108, lines_per_page: 58, entry_overhead: 2, section_overhead: 2 },
  ...over,
});

async function serveTemplates(page: Page, body: unknown) {
  await page.route(TEMPLATES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

function card(page: Page, name: string) {
  return page.getByRole('article', { name });
}

test('a partial warmup is named as partial, and every layout action has its own name', async ({ page }) => {
  await signIn(page);
  await serveTemplates(page, {
    templates: [
      template(),
      template({
        key: 'onyx',
        name: 'Onyx',
        page_size: 'Letter',
        line_model: { chars_per_line: 96, lines_per_page: 49, entry_overhead: 2, section_overhead: 2 },
      }),
    ],
    defaultKey: 'cobalt',
    defaultAccent: '#2563eb',
    calibration: { ok: true, templates_warmed: ['cobalt@1.0.0'] },
  });
  await page.goto('/resume/templates');

  const service = page.getByRole('region', { name: 'Build service' });
  await expect(service).toContainText('1 of 2 layouts calibrated');
  await expect(service).toContainText('Only calibrated layouts can be verified');
  await expect(service.getByText('Calibrated', { exact: true })).toHaveCount(0);

  // The names lead with the words on the button, so saying "make default" to a
  // voice control matches the control it names.
  await expect(
    card(page, 'Cobalt').getByRole('button', { name: 'Current default: Cobalt' }),
  ).toBeDisabled();
  await expect(
    card(page, 'Onyx').getByRole('button', { name: 'Make default: Onyx' }),
  ).toBeVisible();
  await expect(card(page, 'Cobalt').getByText('58 lines/page')).toBeVisible();
  await expect(card(page, 'Onyx').getByText('96 chars/line')).toBeVisible();
});

test('a failed catalogue says so and Retry can recover it', async ({ page }) => {
  await signIn(page);
  let fail = true;
  await page.route(TEMPLATES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (fail) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":{"code":"UNAVAILABLE","message":"template registry unavailable"}}',
      });
    }
    return route.continue();
  });
  await page.goto('/resume/templates');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load résumé templates');
  await expect(alert).toContainText('template registry unavailable');
  await expect(page.getByText('No résumé templates are available')).toHaveCount(0);

  fail = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: /^Layouts/ })).toBeVisible();
});

test('an empty catalogue is not described as a load failure or a build-service failure', async ({ page }) => {
  await signIn(page);
  await serveTemplates(page, {
    templates: [],
    defaultKey: 'cobalt',
    defaultAccent: '#2563eb',
    calibration: { ok: true, templates_warmed: ['cobalt@1.0.0'] },
  });
  await page.goto('/resume/templates');

  await expect(page.getByText('No résumé templates are available')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Build service' })).toHaveCount(0);
});

test('changing the default reports success and survives reload without leaving test state behind', async ({ page }) => {
  await signIn(page);
  await page.goto('/resume/templates');
  await expect(page.getByRole('heading', { name: /^Layouts/ })).toBeVisible();

  const cards = page.locator('article[data-template-key]');
  await expect(cards.first()).toBeVisible();
  const current = cards.filter({ has: page.getByText('Default', { exact: true }) });
  // Both values are read because the default has to be put back afterwards.
  // The assertion that proves they are there retries; a snapshot taken once
  // would read an empty card mid-render and restore nothing.
  await expect(current).toHaveAttribute('data-template-key', /\S/);
  await expect(current.getByRole('heading')).toHaveText(/\S/);
  const originalKey = (await current.getAttribute('data-template-key')) ?? '';
  const originalName = ((await current.getByRole('heading').textContent()) ?? '').trim();

  const candidate = cards.filter({ hasNot: page.getByText('Default', { exact: true }) }).first();
  await expect(candidate).toHaveAttribute('data-template-key', /\S/);
  await expect(candidate.getByRole('heading')).toHaveText(/\S/);
  const candidateKey = (await candidate.getAttribute('data-template-key')) ?? '';
  const candidateName = ((await candidate.getByRole('heading').textContent()) ?? '').trim();
  // The candidate has to be a different layout, or the change is not a change.
  expect(candidateKey).not.toBe(originalKey);

  try {
    await candidate.getByRole('button', { name: `Make default: ${candidateName!}` }).click();
    await expect(toast(page, `${candidateName} is now the default template.`)).toBeVisible();
    await expect(card(page, candidateName!).getByText('Default', { exact: true })).toBeVisible();
  } finally {
    // Settings outlive a test worker. Put the real workspace back exactly as we
    // found it, including if an assertion above fails half-way through.
    const restored = await apiPatch(page, '/resumes/templates/default', { templateKey: originalKey });
    expect(restored.ok(), `could not restore template default: ${restored.status()}`).toBe(true);
  }

  await page.reload();
  await expect(card(page, originalName!).getByText('Default', { exact: true })).toBeVisible();
});

test('changing the default refreshes the already-cached Settings value', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings/preferences');
  // Settings' template picker is the shared Select, a combobox whose trigger
  // shows the layout's name; a native select's `value` is not there to read.
  const settingsTemplate = page.getByRole('combobox', { name: 'Default template' });
  await expect(settingsTemplate).toBeVisible();

  await page.goto('/resume/templates');
  await expect(page.getByRole('heading', { name: /^Layouts/ })).toBeVisible();
  const cards = page.locator('article[data-template-key]');
  const current = cards.filter({ has: page.getByText('Default', { exact: true }) });
  await expect(current).toHaveAttribute('data-template-key', /\S/);
  const originalKey = (await current.getAttribute('data-template-key')) ?? '';
  const candidate = cards.filter({ hasNot: page.getByText('Default', { exact: true }) }).first();
  await expect(candidate).toHaveAttribute('data-template-key', /\S/);
  await expect(candidate.getByRole('heading')).toHaveText(/\S/);
  const candidateKey = (await candidate.getAttribute('data-template-key')) ?? '';
  const candidateName = ((await candidate.getByRole('heading').textContent()) ?? '').trim();
  // The candidate has to be a different layout, or the change is not a change.
  expect(candidateKey).not.toBe(originalKey);

  try {
    await candidate.getByRole('button', { name: `Make default: ${candidateName!}` }).click();
    await expect(toast(page, `${candidateName} is now the default template.`)).toBeVisible();

    // The Settings query was loaded first. Its five-second stale window used to
    // preserve the old default on this exact navigation path.
    await page.goto('/settings/preferences');
    await expect(page.getByRole('combobox', { name: 'Default template' })).toContainText(
      candidateName!,
    );
  } finally {
    const restored = await apiPatch(page, '/resumes/templates/default', { templateKey: originalKey });
    expect(restored.ok(), `could not restore template default: ${restored.status()}`).toBe(true);
  }
});

test('a rejected default change leaves the current default intact and reports the failure', async ({ page }) => {
  await signIn(page);
  await page.goto('/resume/templates');
  await expect(page.getByRole('heading', { name: /^Layouts/ })).toBeVisible();

  const cards = page.locator('article[data-template-key]');
  const current = cards.filter({ has: page.getByText('Default', { exact: true }) });
  const originalName = (await current.getByRole('heading').textContent())?.trim();
  const candidate = cards.filter({ hasNot: page.getByText('Default', { exact: true }) }).first();
  const candidateName = (await candidate.getByRole('heading').textContent())?.trim();

  await page.route('**/api/v1/resumes/templates/default', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"UNAVAILABLE","message":"settings store unavailable"}}',
    });
  });
  await candidate.getByRole('button', { name: `Make default: ${candidateName!}` }).click();

  await expect(page.getByRole('alert')).toContainText('settings store unavailable');
  await expect(card(page, originalName!).getByText('Default', { exact: true })).toBeVisible();
});

test('the template gallery has no automated a11y violations', async ({ page }) => {
  await signIn(page);
  await page.goto('/resume/templates');
  await expect(page.getByRole('heading', { name: /^Layouts/ })).toBeVisible();
  await expectNoA11yViolations(page);
});
