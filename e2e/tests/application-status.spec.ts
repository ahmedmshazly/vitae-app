import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiPost, apiPatch, expectOkJson } from './helpers/api.js';

/**
 * The application status machine, end to end (FR-CAR-003).
 *
 * The rule under test is not "a status can be set". It is that the interface
 * offers the moves the server would accept and no others, that a move the
 * machine refuses is refused wherever it is attempted, and that correcting a
 * status the operator entered wrongly stays possible and stays distinguishable
 * from claiming the application moved.
 */

const statusGroup = (page: Page) => page.getByRole('group', { name: 'Record a status move' });

async function application(page: Page, status: string): Promise<string> {
  const stamp = Date.now();
  const created = await apiPost(page, '/applications', {
    title: `Status walk ${status} ${stamp}`,
    props: { role_title: `Status walk ${status} ${stamp}`, status },
  });
  const body = await expectOkJson<{ application: { id: string } }>(created, 'application');
  return body.application.id;
}

test('the dossier offers the moves that are legal and none that are not', async ({ page }) => {
  await signIn(page);
  const id = await application(page, 'screening');
  await page.goto(`/career/applications/${id}`);

  const moves = statusGroup(page);
  // Forward-permissive: from screening the pipeline runs on to interview and
  // offer, and any of the three outcomes closes it.
  for (const legal of ['Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn']) {
    await expect(moves.getByRole('button', { name: legal, exact: true })).toBeVisible();
  }
  // Backwards is not a move. It is not offered as a disabled control either,
  // because a greyed-out button asks the operator to read a rule off a control
  // rather than be told it.
  for (const illegal of ['Draft', 'Applied']) {
    await expect(moves.getByRole('button', { name: illegal, exact: true })).toHaveCount(0);
  }
});

test('recording a move narrows what is offered next', async ({ page }) => {
  await signIn(page);
  const id = await application(page, 'applied');
  await page.goto(`/career/applications/${id}`);

  await statusGroup(page).getByRole('button', { name: 'Interview', exact: true }).click();
  await expect(page.getByText('Moved to Interview')).toBeVisible();
  // Screening sat behind it a moment ago and cannot be reached from here.
  await expect(
    statusGroup(page).getByRole('button', { name: 'Screening', exact: true }),
  ).toHaveCount(0);
  await expect(statusGroup(page).getByRole('button', { name: 'Offer', exact: true })).toBeVisible();
});

test('an outcome closes the record, and says so in words', async ({ page }) => {
  await signIn(page);
  const id = await application(page, 'offer');
  await page.goto(`/career/applications/${id}`);

  await statusGroup(page).getByRole('button', { name: 'Accepted', exact: true }).click();
  await expect(page.getByText('Moved to Accepted')).toBeVisible();
  // No move group at all once the record is closed, and a sentence rather than
  // an empty region where the buttons used to be.
  await expect(page.getByText('Accepted closes this application. Nothing follows an outcome.')).toBeVisible();
  await expect(statusGroup(page)).toHaveCount(0);
});

test('a status entered wrongly can still be corrected, and is recorded as a correction', async ({
  page,
}) => {
  await signIn(page);
  // The trap the guard would otherwise set: an operator mis-clicks Rejected,
  // and every forward move is now refused for a record that was never rejected.
  const id = await application(page, 'rejected');
  await page.goto(`/career/applications/${id}`);
  await expect(statusGroup(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Correct status' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This application is recorded as Rejected');
  await dialog
    .getByRole('group', { name: 'What the status should say' })
    .getByRole('button', { name: 'Interview', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Record correction' }).click();

  await expect(page.getByText('Status corrected to Interview')).toBeVisible();
  // Corrected, not moved: the record now sits where it should have been all
  // along, and the moves that follow interview are offered again.
  await expect(statusGroup(page).getByRole('button', { name: 'Offer', exact: true })).toBeVisible();
});

test('the generic record patch obeys the same machine as the dedicated endpoint', async ({
  page,
}) => {
  await signIn(page);
  const id = await application(page, 'accepted');
  // Straight at the node API, which is the door the application form itself
  // uses. A guard only the dedicated endpoint ran would be no guard at all.
  const refused = await apiPatch(page, `/nodes/${id}`, {
    props: { role_title: 'Status walk accepted', status: 'screening' },
  });
  expect(refused.status(), 'the back door refuses the same move').toBe(422);
  const body = (await refused.json()) as { error: { message: string } };
  expect(body.error.message).toContain('accepted');
  expect(body.error.message).toContain('correct the status');
});
