import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * Screen 28: Landing (`/welcome`).
 *
 * Quiet poster: brand as the hero signal, one headline, one sentence, CTAs,
 * and the product shot. No constellation wash, gradient words, private-beta
 * pill, or stats strip in the first viewport.
 */

test('the hero leads with Vitae, not a stats strip or ambient wash', async ({ page }) => {
  await page.goto('/welcome');

  const hero = page.locator('.mk-hero');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(hero.getByText('Vitae', { exact: true })).toBeVisible();
  await expect(
    hero.getByRole('heading', { name: 'Your life, as a living network.' }),
  ).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(hero.getByRole('img', { name: /Today dashboard/i })).toBeVisible();

  // Facts live after the product argument, not in the hero composition.
  await expect(hero.getByText('typed records', { exact: false })).toHaveCount(0);
  await expect(page.locator('.mk-hero__sky')).toHaveCount(0);
  await expect(page.locator('.mk-grad')).toHaveCount(0);
});

test('the open-source section explains self-hosting and contribution', async ({ page }) => {
  await page.goto('/welcome#self-host');
  await expect(page.getByRole('heading', { name: 'A system you can run yourself.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find source on GitHub' })).toHaveAttribute(
    'href',
    /github\.com\/search/,
  );
  await expect(page.getByRole('link', { name: 'Tour the interface' })).toHaveAttribute(
    'href',
    '/tour',
  );
  await expect(page.getByRole('link', { name: /Read the operating principles/i })).toHaveAttribute(
    'href',
    '/manifesto',
  );
});

test('sign-in and tour are reachable from the poster', async ({ page }) => {
  await page.goto('/welcome');
  await page
    .getByRole('navigation', { name: 'Site' })
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL(/\/signin/);

  await page.goto('/welcome');
  await page.getByRole('link', { name: 'Take the tour' }).first().click();
  await expect(page).toHaveURL(/\/tour/);
});

test('the landing page has no automated a11y violations', async ({ page }) => {
  await page.goto('/welcome');
  await expect(
    page.getByRole('heading', { name: 'Your life, as a living network.' }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
