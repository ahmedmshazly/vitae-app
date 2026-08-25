import { test, expect } from '@playwright/test';
import { signInDemo } from './helpers/auth';

/**
 * Full résumé journey in the DEMO space (rich seeded data): manual atom
 * selection with checkboxes, compile to a real PDF, finalize, and see the
 * output in the library. Requires `pnpm seed:demo` + the buildsvc container.
 */
// A real Tectonic compile sits in the middle of this journey, and the waits on
// the preview iframe already ask for 30s apiece. The default budget is 30s for
// the whole test, so those waits could never be reached.
test.describe.configure({ timeout: 90_000 });

test('manual selection → compile → finalize → appears in Outputs', async ({ page }) => {
  await signInDemo(page);
  await page.goto('/resume/tailor');

  // Open the seeded Aurora Dynamics target and wait for it to hydrate
  // (keyword chips render in the same commit as the draft hydration).
  await page.getByText('Machine Learning Engineer').first().click();
  await expect(page).toHaveURL(/target=/);
  await expect(page.getByRole('heading', { name: /^Weighted keywords/ })).toBeVisible({
    timeout: 10_000,
  });

  // Switch to manual mode and hand-pick three atoms. The two modes are a named
  // group, so the button is asked for inside it rather than by name alone.
  await page
    .getByRole('group', { name: 'Selection mode' })
    .getByRole('button', { name: 'Manual', exact: true })
    .click();
  await expect(page.getByText(/all atoms/i)).toBeVisible({ timeout: 10_000 });
  // Scoped to the atom lists: the target rail carries a Show archived checkbox
  // of its own, and it comes first in the document. A Radix checkbox is a
  // button with the role, not an `input`, so ask for the role.
  const atomChecks = page.getByRole('list', { name: /^Atoms from / }).getByRole('checkbox');
  await atomChecks.nth(0).check();
  await atomChecks.nth(1).check();
  await atomChecks.nth(2).check();

  // The included list + page meter reflect the manual picks.
  await expect(page.getByRole('list', { name: 'Included bullets, in résumé order' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('.vt-meter').first()).toBeVisible({ timeout: 10_000 });

  // Compile → PDF preview.
  await page.getByRole('button', { name: /compile pdf/i }).click();
  await expect(page.locator('iframe[title="résumé preview"]')).toBeVisible({ timeout: 30_000 });

  // Finalize → status card with the gates, then the output shows up in Outputs.
  // Three hand-picked bullets cannot clear the coverage gate, so the honest
  // receipt here is the draft one. Both wordings are accepted because which
  // one lands is the product's call, not the test's, but they are the wordings
  // the card actually uses: the draft line reads "Saved as a draft".
  await page.getByRole('button', { name: /^finalize$/i }).click();
  await expect(page.getByText(/résumé finalized|saved as a draft/i)).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/resume/outputs');
  await expect(page.getByText(/aurora dynamics/i).first()).toBeVisible({ timeout: 10_000 });
});
