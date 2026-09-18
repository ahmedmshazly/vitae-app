import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

const targets = [
  {
    id: 'warm-primary',
    title: 'Long-Form Research Cooperative',
    kind: 'community',
    city: 'Alexandria',
    stage: 'applied',
    reach: 'direct',
    reachable: true,
    affinity: 0.81,
    peopleCount: 2,
    openRoles: 1,
  },
  {
    id: 'warm-empty',
    title: 'Northstar Fellowship',
    kind: 'company',
    city: 'Cairo',
    stage: null,
    reach: 'no path',
    reachable: false,
    affinity: 0,
    peopleCount: 0,
    openRoles: 0,
  },
  {
    id: 'warm-retry',
    title: 'Recovery Lab',
    kind: 'company',
    city: 'Giza',
    stage: null,
    reach: '2 hops',
    reachable: true,
    affinity: 0.61,
    peopleCount: 1,
    openRoles: 0,
  },
];

function pathResponse(target = targets[0]!) {
  return {
    org: { id: target.id, title: target.title },
    paths: [
      {
        hops: [
          { nodeId: 'warm-self', title: 'You', type: 'person' },
          {
            nodeId: 'warm-ari',
            title: 'Ari Rivera',
            type: 'person',
            viaEdgeType: 'knows',
            viaStrength: 0.72,
          },
          {
            nodeId: target.id,
            title: target.title,
            type: 'organization',
            viaEdgeType: 'works_at',
          },
        ],
        score: 0.63,
        strengthLabel: 'strong',
        askerId: 'warm-ari',
        askerName: 'Ari Rivera',
        why: 'Ari has a recorded role at this organization and a strong tie to you.',
        factors: ['1 hop', 'Works there', 'Strong tie', 'Strong path'],
      },
      {
        hops: [
          { nodeId: 'warm-self', title: 'You', type: 'person' },
          {
            nodeId: 'warm-jo',
            title: 'Jo Nassar',
            type: 'person',
            viaEdgeType: 'knows',
            viaStrength: 0.52,
          },
          {
            nodeId: 'warm-kim',
            title: 'Kim Hossam',
            type: 'person',
            viaEdgeType: 'knows',
            viaStrength: 0.3,
          },
          {
            nodeId: target.id,
            title: target.title,
            type: 'organization',
            viaEdgeType: 'works_at',
          },
        ],
        score: 0.31,
        strengthLabel: 'medium',
        askerId: 'warm-jo',
        askerName: 'Jo Nassar',
        why: 'Jo Nassar → Kim Hossam chains into this organization; each extra hop adds context to check.',
        factors: ['2 hops', 'Works there', 'Medium tie', 'Medium path'],
      },
    ],
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('Warm paths makes destination, route evidence and safe draft handoff usable at every viewport', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.route('**/api/v1/intros/targets', (route) => route.fulfill({ json: { targets } }));
  let retryAttempts = 0;
  await page.route('**/api/v1/intros/paths*', (route) => {
    const targetId = new URL(route.request().url()).searchParams.get('orgId');
    if (targetId === 'warm-empty')
      return route.fulfill({ json: { org: { id: targetId }, paths: [] } });
    if (targetId === 'warm-retry' && retryAttempts++ === 0) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Route calculation is delayed.' },
        }),
      });
    }
    return route.fulfill({ json: pathResponse(targets.find((target) => target.id === targetId)) });
  });
  let draftRequest: Record<string, unknown> | undefined;
  await page.route('**/api/v1/composer/draft', (route) => {
    draftRequest = route.request().postDataJSON();
    return route.fulfill({
      json: {
        body: 'Hello Ari, could I ask for your perspective on the cooperative?',
        facts: ['Recorded role', 'Strong tie'],
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/network/intelligence?lens=reach&org=warm-primary');
  await expect(page.getByRole('heading', { name: 'Top route via Ari Rivera' })).toBeVisible();
  await expect(page.getByLabel('Recorded route evidence').first()).toContainText('Strong tie');
  await expect(
    page.getByRole('button', { name: /Long-Form Research Cooperative/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByRole('button', { name: /Long-Form Research Cooperative/ })).toHaveCSS(
    'outline-style',
    'solid',
  );
  await page.emulateMedia({ forcedColors: 'none' });
  await expectNoA11yViolations(page, '.page--warm-paths');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('warm-routes-1440.png'), animations: 'disabled' });

  const filter = page.getByRole('textbox', { name: 'Filter organizations' });
  await filter.fill('Northstar');
  await expect(
    page.getByText(/Viewing Long-Form Research Cooperative, which is outside this filter/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear the filter' }).click();

  await page.getByRole('button', { name: /Northstar Fellowship/ }).click();
  await expect(page).toHaveURL(/org=warm-empty/);
  await expect(page.getByText('No warm path to Northstar Fellowship yet')).toBeVisible();
  await page.screenshot({ path: info.outputPath('warm-empty-1440.png'), animations: 'disabled' });
  await page.goBack();
  await expect(page).toHaveURL(/org=warm-primary/);
  await expect(page.getByRole('heading', { name: 'Top route via Ari Rivera' })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('No warm path to Northstar Fellowship yet')).toBeVisible();

  await page.setViewportSize({ width: 834, height: 1000 });
  await page.getByRole('button', { name: /Recovery Lab/ }).click();
  const failure = page.getByRole('alert');
  await expect(failure).toContainText("Couldn't work out how to reach Recovery Lab");
  await expect(failure).toContainText('Route calculation is delayed.');
  await page.screenshot({ path: info.outputPath('warm-error-834.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Top route via Ari Rivera' })).toBeVisible();
  await expectNoA11yViolations(page, '.page--warm-paths');
  await expectNoHorizontalOverflow(page);

  await page.goBack();
  await expect(page.getByText('No warm path to Northstar Fellowship yet')).toBeVisible();
  await page.goBack();
  const opener = page.getByRole('button', { name: 'Draft request to Ari Rivera - route 1' });
  await expect(opener).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const help = page.getByRole('button', { name: 'How this works' });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('How routes are ranked', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not predict an introduction or a reply/)).toBeVisible();
  await expectNoA11yViolations(page, '.vt-popover');
  await page.screenshot({ path: info.outputPath('warm-help-390.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();

  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Draft message')).toHaveValue(
    'Hello Ari, could I ask for your perspective on the cooperative?',
  );
  expect(draftRequest).toMatchObject({
    personId: 'warm-ari',
    targetOrgId: 'warm-primary',
    kind: 'explore',
  });
  await expectNoA11yViolations(page, '[role="dialog"]');
  await page.screenshot({ path: info.outputPath('warm-composer-390.png'), animations: 'disabled' });
  const acknowledgement = dialog.getByRole('checkbox', {
    name: 'I have sent this message outside Vitae',
  });
  await acknowledgement.scrollIntoViewIfNeeded();
  const acknowledgementBox = await acknowledgement.boundingBox();
  const footerBox = await dialog.locator('.vt-modal__foot').boundingBox();
  expect(acknowledgementBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(acknowledgementBox!.y + acknowledgementBox!.height).toBeLessThanOrEqual(footerBox!.y);
  await page.screenshot({
    path: info.outputPath('warm-composer-confirmation-390.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expectNoHorizontalOverflow(page);
});
