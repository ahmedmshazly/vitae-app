import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 28: Landing. `/welcome` is a legacy alias and redirects to `/`.
 *
 * Quiet poster: brand as the leading signal, one headline, one sentence, CTAs,
 * and the product shot. No constellation wash, gradient words, private-beta
 * pill, or stats strip in the first viewport.
 */

test('the poster leads with Vitae, not a stats strip or ambient wash', async ({ page }) => {
  await page.goto('/welcome');

  const hero = page.locator('.mk-hero');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Vitae home' })).toBeVisible();
  await expect(
    hero.getByRole('heading', {
      name: 'When the right role arrives, your career should already be in order.',
    }),
  ).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Take the product tour' })).toBeVisible();
  await expect(hero.getByRole('img', { name: /person record/i })).toBeVisible();

  // Facts live after the product argument, not in the hero composition.
  await expect(hero.getByText('typed records', { exact: false })).toHaveCount(0);
  await expect(page.locator('.mk-hero__sky')).toHaveCount(0);
  await expect(page.locator('.mk-grad')).toHaveCount(0);
});

test('the poster still points at the source, the tour, and the principles', async ({ page }) => {
  await page.goto('/welcome');
  // The dedicated self-host section is gone; its three destinations moved into
  // the trust footer, which is where the claims they back now live.
  await expect(page.getByRole('heading', { name: /trust a career system/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open-source foundation/i })).toHaveAttribute(
    'href',
    /github\.com\/search/,
  );
  await expect(
    page.getByRole('link', { name: 'Product tour', exact: true }),
  ).toHaveAttribute('href', '/tour');
  await expect(page.getByRole('link', { name: 'Manifesto' })).toHaveAttribute('href', '/manifesto');
});

test('sign-in and tour are reachable from the poster', async ({ page }) => {
  await page.goto('/welcome');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL(/\/signin/);

  await page.goto('/welcome');
  await page.getByRole('link', { name: 'Take tour', exact: true }).first().click();
  await expect(page).toHaveURL(/\/tour/);
});

test('the landing page has no automated a11y violations', async ({ page }) => {
  await page.goto('/welcome');
  await expect(
    page.getByRole('heading', {
      name: 'When the right role arrives, your career should already be in order.',
    }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
