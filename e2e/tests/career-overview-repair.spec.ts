import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { signIn } from './helpers/auth';

const APPLICATIONS = '**/api/v1/applications';
const LONG_ORGANIZATION =
  'The Institute for Durable Infrastructure, Public Computing and Applied Research';

function runwayPayload() {
  return {
    applications: [
      {
        id: 'career-overdue',
        title: 'Principal platform engineer',
        role_title: 'Principal platform engineer',
        status: 'interview',
        organization: { id: 'orbit', type: 'organization', title: LONG_ORGANIZATION },
        referred_by: { id: 'reese', type: 'person', title: 'Reese Tan' },
        applied_on: '2026-08-20',
        deadline: null,
        next_step: 'Send the architecture case study and confirm interview attendees',
        next_step_date: '2026-09-10',
        channel: 'referral',
        location_mode: 'hybrid',
        salary_range: null,
        job_url: null,
        target_id: null,
        resume_id: null,
        interview_count: 2,
        next_interview: null,
        attention: { kind: 'overdue', date: '2026-09-10', source: 'next_step' },
        notes_md: '',
        source: 'manual',
        created_at: '2026-08-20T10:00:00.000Z',
        updated_at: '2026-09-10T10:00:00.000Z',
      },
      {
        id: 'career-draft',
        title: 'Research systems lead',
        role_title: 'Research systems lead',
        status: 'draft',
        organization: { id: 'field', type: 'organization', title: 'Field Cooperative' },
        referred_by: null,
        applied_on: null,
        deadline: null,
        next_step: null,
        next_step_date: null,
        channel: null,
        location_mode: 'remote',
        salary_range: null,
        job_url: null,
        target_id: null,
        resume_id: null,
        interview_count: 0,
        next_interview: null,
        attention: null,
        notes_md: '',
        source: 'manual',
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
      },
      {
        id: 'career-accepted',
        title: 'Product engineering director',
        role_title: 'Product engineering director',
        status: 'accepted',
        organization: { id: 'harbor', type: 'organization', title: 'Harbor Works' },
        referred_by: null,
        applied_on: '2026-06-01',
        deadline: null,
        next_step: null,
        next_step_date: null,
        channel: 'direct',
        location_mode: null,
        salary_range: null,
        job_url: null,
        target_id: null,
        resume_id: null,
        interview_count: 4,
        next_interview: null,
        attention: null,
        notes_md: '',
        source: 'manual',
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-08-30T10:00:00.000Z',
      },
    ],
    counts: {
      draft: 1,
      applied: 0,
      screening: 0,
      interview: 1,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
      accepted: 1,
    },
    total: 3,
    active: 2,
    needs_attention: 1,
  };
}

test('Career keeps the next decision, filter recovery and whole runway usable at every width', async ({
  page,
}, info) => {
  await signIn(page);
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route(APPLICATIONS, (route) => route.fulfill({ json: runwayPayload() }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/career');
  await expect(page.getByRole('heading', { name: 'Career', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Next moves/ })).toBeVisible();
  await expect(page.getByText('Needs attention')).toBeVisible();
  const principalLinks = page.getByRole('link', {
    name: `Open Principal platform engineer application at ${LONG_ORGANIZATION}`,
  });
  await expect(principalLinks).toHaveCount(2);
  await expect(principalLinks.first()).toBeVisible();

  const runway = page.getByLabel(
    'Application pipeline stages. Scroll horizontally to review all five stages.',
  );
  await runway.focus();
  await expect(runway).toBeFocused();
  await expect(page.getByRole('list', { name: 'Active application stages' })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.screenshot({
    path: info.outputPath('career-runway-1440.png'),
    animations: 'disabled',
  });

  const search = page.getByRole('textbox', { name: 'Search applications' });
  await search.fill('Field');
  await expect(page).toHaveURL(/q=Field/);
  await expect(page.getByText('1 of 3 shown')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  await search.fill('no matching organization');
  await expect(page.getByText('No applications match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('3 shown')).toBeVisible();
  await expect(page).not.toHaveURL(/q=/);

  await page.goto('/career/applications');
  await expect(page.getByRole('heading', { name: 'Career', exact: true })).toBeVisible();
  await expect(page.getByText('3 shown')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0 }));
  await expect(runway).toBeVisible();
  expect(await runway.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectNoA11yViolations(page);
  await page.screenshot({ path: info.outputPath('career-runway-390.png'), animations: 'disabled' });
  await page.getByRole('heading', { name: /Application runway/ }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('career-runway-panel-390.png'),
    animations: 'disabled',
  });
  expect(consoleErrors).toEqual([]);
});

test('Career distinguishes a failed initial load from an empty runway and recovers on retry', async ({
  page,
}) => {
  await signIn(page);
  let unavailable = true;
  await page.route(APPLICATIONS, (route) =>
    route.fulfill(
      unavailable
        ? {
            status: 503,
            contentType: 'application/json',
            body: '{"error":{"code":"OFFLINE","message":"Applications are unavailable"}}',
          }
        : { json: runwayPayload() },
    ),
  );
  await page.goto('/career');
  await expect(page.getByRole('alert')).toContainText("Couldn't load your applications");
  await expect(page.getByText('No applications yet')).toHaveCount(0);

  unavailable = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: /Application runway/ })).toBeVisible();
  await expect(page.getByText('No applications yet')).toHaveCount(0);
});
