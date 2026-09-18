import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('application dossier protects corrections and preserves evidence through refresh recovery', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  // Parallel frontend work can hot-reload the SPA while a guarded draft is
  // open. Keep this journey on the modules it loaded; API traffic is unchanged.
  const webHost = new URL(info.project.use.baseURL ?? 'http://localhost:5173').host;
  await page.routeWebSocket(
    (url) => url.host === webHost,
    (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const event = JSON.parse(message) as { type?: string };
          if (event.type === 'update' || event.type === 'full-reload') return;
        }
        socket.send(message);
      });
    },
  );
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const title = `Staff engineer for accessible research and community infrastructure ${stamp}`;
  const { application } = await expectOkJson<{ application: { id: string } }>(
    await apiPost(page, '/applications', {
      title,
      props: {
        role_title: title,
        status: 'applied',
        next_step: 'Prepare questions about accessible distributed systems',
        salary_range: 'EGP 180,000–220,000 per month',
        next_step_date: '2026-12-15',
      },
      notes_md:
        'Fictional review fixture. Discuss ownership, operational support, and accessible recruitment.\nReference: ' +
        'research'.repeat(20),
    }),
    'Create fictional application',
  );
  const { node: company } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'organization',
      title: `Fictional accessible infrastructure research cooperative ${stamp}`,
      props: {},
    }),
    'Create fictional company',
  );
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Fictional referral partner for the infrastructure research team ${stamp}`,
      props: {},
    }),
    'Create fictional referrer',
  );
  const { node: interview } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'interview',
      title: `Architecture discussion ${stamp}`,
      props: {
        round: 'Architecture discussion',
        scheduled_at: '2026-12-15T10:30:00.000Z',
        format: 'video',
        outcome: 'scheduled',
        prep_notes: 'Review queues and accessible interfaces.',
        reflection: 'Follow up on operational ownership.',
      },
    }),
    'Create fictional interview',
  );
  for (const edge of [
    { type: 'APPLIED_TO', src: application.id, dst: company.id },
    { type: 'REFERRED_BY', src: application.id, dst: person.id },
    { type: 'INTERVIEW_FOR', src: interview.id, dst: application.id },
  ])
    await expectOkJson(
      await apiPost(page, '/edges', { ...edge, props: {} }),
      'Link dossier evidence',
    );

  await page.goto(`/career/applications/${application.id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText(/10:30.*UTC/)).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator('#main-content').evaluate((element) => {
      element.scrollTop = 0;
    });
    await expectNoA11yViolations(page, '.application-dossier');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: info.outputPath(`application-dossier-${width}.png`),
      animations: 'disabled',
    });
    await page.getByRole('complementary', { name: 'Application context' }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`application-context-${width}.png`),
      animations: 'disabled',
    });
  }

  await page.getByRole('button', { name: 'Edit interview: Architecture discussion' }).click();
  const interviewDialog = page.getByRole('dialog', { name: 'Edit interview', exact: true });
  await expect(interviewDialog.getByLabel('Prep notes', { exact: true })).toHaveValue(
    'Review queues and accessible interfaces.',
  );
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await expectNoA11yViolations(page, '[role="dialog"]');
    await expect(interviewDialog.getByRole('button', { name: 'Save changes' })).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`application-interview-editor-${width}.png`),
      animations: 'disabled',
    });
  }
  await interviewDialog
    .getByLabel('Prep notes', { exact: true })
    .fill('Retained interview preparation draft');
  await interviewDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(interviewDialog.getByLabel('Prep notes', { exact: true })).toHaveValue(
    'Retained interview preparation draft',
  );
  await interviewDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(interviewDialog).toBeHidden();
  await expect(page.getByText('Prepare: Retained interview preparation draft')).toBeVisible();

  let failCorrection = true;
  await page.route(`**/api/v1/applications/${application.id}/status`, async (route) => {
    if (failCorrection)
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Fixture status response unavailable' } },
      });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Correct status', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Correct the recorded status' });
  await correction.getByRole('button', { name: 'Screening', exact: true }).click();
  await correction.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(correction.getByRole('button', { name: 'Screening', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await correction.getByRole('button', { name: 'Record correction' }).click();
  await expect(correction.getByText('Correction not confirmed')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await expectNoA11yViolations(page, '[role="dialog"]');
    await expect(correction.getByRole('button', { name: 'Record correction' })).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`application-correction-${width}.png`),
      animations: 'disabled',
    });
  }
  failCorrection = false;
  let failRefresh = true;
  await page.route(`**/api/v1/applications/${application.id}`, (route) =>
    failRefresh
      ? route.fulfill({
          status: 503,
          json: { error: { message: 'Fixture dossier refresh unavailable' } },
        })
      : route.continue(),
  );
  await correction.getByRole('button', { name: 'Record correction' }).click();
  await expect(correction).toBeHidden({ timeout: 20000 });
  await expect(page.getByText('Application refresh failed')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator('#main-content').evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit application' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Correct status' })).toBeDisabled();
    await expectNoA11yViolations(page, '.application-dossier');
    await page.screenshot({
      path: info.outputPath(`application-refresh-${width}.png`),
      animations: 'disabled',
    });
  }
  failRefresh = false;
  await page.getByRole('button', { name: 'Retry refresh' }).click();
  await expect(page.getByText('Application refresh failed')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Correct status' })).toBeEnabled();
  await expect(
    page
      .getByRole('group', { name: 'Record a status move' })
      .getByRole('button', { name: 'Screening', exact: true }),
  ).toHaveCount(0);
  const saved = await expectOkJson<{
    application: {
      status: string;
      interviews: { prep_notes: string }[];
      referred_by: { id: string };
    };
  }>(await apiGet(page, `/applications/${application.id}`), 'Read saved dossier');
  expect(saved.application.status).toBe('screening');
  expect(saved.application.interviews[0]!.prep_notes).toBe('Retained interview preparation draft');
  expect(saved.application.referred_by.id).toBe(person.id);
  expect(errors).toEqual([]);
});
