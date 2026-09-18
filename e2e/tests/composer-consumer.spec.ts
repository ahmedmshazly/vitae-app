import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/a11y';

// Consumer regression only: this does not certify the unreviewed Warm paths screen.
test('Warm paths supplies its target to the shared composer and retains the originating path', async ({
  page,
}, info) => {
  await signIn(page);
  const target = {
    id: 'composer-consumer-org',
    title: 'Fictional Research Cooperative',
    kind: 'community',
    city: 'Alexandria',
    stage: null,
    reach: 'warm',
    reachable: true,
    affinity: 0.7,
    peopleCount: 1,
    openRoles: 0,
  };
  await page.route('**/api/v1/intros/targets', (route) =>
    route.fulfill({ json: { targets: [target] } }),
  );
  await page.route('**/api/v1/intros/paths*', (route) =>
    route.fulfill({
      json: {
        org: target,
        paths: [
          {
            hops: [
              { nodeId: 'self', title: 'You', type: 'person' },
              {
                nodeId: 'consumer-ari',
                title: 'Fictional Ari Rivera',
                type: 'person',
                viaEdgeType: 'knows',
                viaStrength: 0.7,
              },
              {
                nodeId: target.id,
                title: target.title,
                type: 'organization',
                viaEdgeType: 'works_at',
                viaStrength: 0.9,
              },
            ],
            score: 0.63,
            strengthLabel: 'warm',
            askerId: 'consumer-ari',
            askerName: 'Fictional Ari Rivera',
            why: 'Recorded contact linked to this organization.',
            factors: ['Recorded role', 'Warm relationship'],
          },
        ],
      },
    }),
  );
  let requested: Record<string, unknown> | undefined;
  await page.route('**/api/v1/composer/draft', (route) => {
    requested = route.request().postDataJSON();
    return route.fulfill({
      json: {
        body: 'Fictional warm-path draft for the research cooperative.',
        facts: ['Recorded role'],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/network/intelligence?lens=reach&org=composer-consumer-org');
  const opener = page.getByRole('button', {
    name: 'Draft request to Fictional Ari Rivera - route 1',
  });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Draft message')).toHaveValue(
    'Fictional warm-path draft for the research cooperative.',
  );
  expect(requested).toMatchObject({
    personId: 'consumer-ari',
    targetOrgId: target.id,
    kind: 'explore',
    tone: 'warm',
  });
  await expect(dialog).toContainText(target.title);
  await expectNoA11yViolations(page, '[role="dialog"]');
  await page.screenshot({
    path: info.outputPath('warm-path-composer-390.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/org=composer-consumer-org/);
});
