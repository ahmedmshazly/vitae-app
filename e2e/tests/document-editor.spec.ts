import { expect, test } from '@playwright/test';
import { signInDemo } from './helpers/auth';

test('live résumé paper exposes contact, section, entry, and skill controls', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/tailor');
  await page.getByText('Machine Learning Engineer').first().click();

  const paper = page.getByTestId('resume-paper');
  await expect(paper).toBeVisible({ timeout: 15_000 });
  await expect(paper.getByText('Technical Skills')).toBeVisible();
  await expect(paper.getByText('Education')).toBeVisible();
  await expect(paper.locator('[data-resume-section="experience"] [data-resume-item]').first()).toBeVisible();

  // Contacts are first-class ordered items with independent visibility.
  const hideEmail = paper.getByRole('button', { name: /hide email/i });
  if (await hideEmail.count()) {
    await hideEmail.click();
    await expect(paper.getByRole('button', { name: /show email/i })).toBeVisible({ timeout: 10_000 });
    await paper.getByRole('button', { name: /show email/i }).click();
    await expect(paper.getByRole('button', { name: /hide email/i })).toBeVisible({ timeout: 10_000 });
  }

  // Sections remain visible as muted editor blocks when excluded, making them
  // easy to restore without leaving the document.
  await paper.getByRole('button', { name: /hide education section/i }).click();
  await expect(paper.getByRole('button', { name: /show education section/i })).toBeVisible({ timeout: 10_000 });
  await paper.getByRole('button', { name: /show education section/i }).click();
  await expect(paper.getByRole('button', { name: /hide education section/i })).toBeVisible({ timeout: 10_000 });

  // Individual skills toggle independently from their category row.
  const python = paper.getByRole('button', { name: 'Python', exact: true }).first();
  const initiallyDisabled = (await python.getAttribute('title'))?.startsWith('Include') === true;
  await python.click();
  await expect(paper.locator(`button[title="${initiallyDisabled ? 'Exclude' : 'Include'} Python"]`).first()).toBeVisible({
    timeout: 10_000,
  });
  await paper.locator(`button[title="${initiallyDisabled ? 'Exclude' : 'Include'} Python"]`).first().click();
  await expect(paper.locator(`button[title="${initiallyDisabled ? 'Include' : 'Exclude'} Python"]`).first()).toBeVisible({
    timeout: 10_000,
  });
});
