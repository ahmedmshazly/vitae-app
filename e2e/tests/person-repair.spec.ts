import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth';
import { apiGet, apiPost, expectOkJson } from './helpers/api';
import { expectNoA11yViolations } from './helpers/a11y';

test('Add connection creates a complete role for the current person without a duplicate link', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const title = `Contextual role ${stamp}`;
  const { node: person } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', { type: 'person', title: `Role owner ${stamp}`, props: {} }),
    'Create owner',
  );
  await page.goto(`/network/people/${person.id}`);
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByRole('combobox', { name: /^Relationship:/ }).click();
  await page.getByRole('option', { name: 'Career · Held role', exact: true }).click();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('combobox', { name: /^Search/ }).fill(title);
    await page
      .getByRole('option', { name: new RegExp(`Create role '${title}', add details`) })
      .click();
    const form = page.getByRole('dialog', { name: 'New role', exact: true });
    await expect(form.getByText(person.title, { exact: true })).toBeVisible();
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`new-target-form-${width}.png`),
      animations: 'disabled',
    });
    await form.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add connection', exact: true })).toBeVisible();
  }
  await page.getByRole('combobox', { name: /^Search/ }).fill(title);
  await page
    .getByRole('option', { name: new RegExp(`Create role '${title}', add details`) })
    .click();
  await page.getByRole('combobox', { name: 'Employment type', exact: true }).click();
  await page.getByRole('option', { name: 'Full time', exact: true }).click();
  let refuseSavedRead = true;
  const savedReads: string[] = [];
  await page.route(/\/api\/v1\/nodes\/[^/?]+$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if (body.node?.title !== title) return route.fulfill({ response });
    savedReads.push(body.node.id);
    if (refuseSavedRead) {
      return route.fulfill({ status: 503, json: { error: 'Saved record read unavailable' } });
    }
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Create role', exact: true }).click();
  await expect(page.getByText('Record saved · details unavailable')).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    const dialog = page.getByRole('dialog', { name: 'Add connection', exact: true });
    await expect(dialog.getByRole('combobox', { name: /^Relationship:/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Create link', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('combobox', { name: /^Search/ })).toHaveCount(0);
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`saved-target-recovery-${width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Retry loading record' }).click();
    await expect(page.getByText('Record saved · details unavailable')).toBeVisible();
  }
  refuseSavedRead = false;
  await page.getByRole('button', { name: 'Retry loading record' }).click();
  await expect(page.getByRole('button', { name: 'Finish connection', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish connection', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const record = await expectOkJson<{
    edges: { type: string; src: string; dst: string }[];
    neighbors: Record<string, { title: string }>;
  }>(await apiGet(page, `/nodes/${person.id}`), 'Owner connections');
  const links = record.edges.filter(
    (edge) => edge.type === 'HELD' && record.neighbors[edge.dst]?.title === title,
  );
  expect(links).toHaveLength(1);
  expect(links[0]!.src).toBe(person.id);
  expect(savedReads).toHaveLength(5);
  expect(new Set(savedReads).size).toBe(1);
  await page.reload();
  await expect(
    page.locator('.person-connections').getByRole('link', { name: title, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Add connection guards drafts, recovers failures and preserves existing relationship history', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Add connection owner ${stamp}`,
      props: {},
    }),
    'Create scratch person',
  );
  const { node: role } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'role',
      title: `Senior accessibility research and community partnerships engineer ${stamp}`,
      props: { employment_type: 'full_time' },
    }),
    'Create scratch role',
  );
  await page.goto(`/network/people/${person.id}`);
  const fillRole = async () => {
    await page.getByRole('button', { name: 'Add connection', exact: true }).click();
    await page.getByRole('combobox', { name: /^Relationship:/ }).click();
    await page.getByRole('option', { name: 'Career · Held role', exact: true }).click();
    await page.getByRole('combobox', { name: /^Search/ }).fill(role.title);
    await page.getByRole('option', { name: new RegExp(`^${role.title}`) }).click();
  };
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await fillRole();
    const dialog = page.getByRole('dialog', { name: 'Add connection', exact: true });
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`add-connection-draft-${width}.png`),
      animations: 'disabled',
    });
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog.getByText(role.title, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
  }
  await fillRole();
  await page.route('**/api/v1/edges', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'REVIEW_FAILURE', message: 'Fixture link unavailable' } },
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Link not confirmed', { exact: true })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 1000 });
    await page.screenshot({
      path: info.outputPath(`add-connection-recovery-${width}.png`),
      animations: 'disabled',
    });
    await expect(page.getByRole('button', { name: 'Create link' })).toBeInViewport();
  }
  await page.unroute('**/api/v1/edges');
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByRole('dialog', { name: 'Add connection', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: role.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('link', { name: role.title, exact: true })).toBeHidden();

  const { node: other } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Existing partner ${stamp}`,
      props: {},
    }),
    'Create partner',
  );
  const { edge } = await expectOkJson<{ edge: { id: string } }>(
    await apiPost(page, '/edges', {
      type: 'KNOWS',
      src: person.id,
      dst: other.id,
      props: {
        relation: 'friend',
        topics: ['Keep this history'],
        favors: [
          {
            id: `favor-${stamp}`,
            what: 'A promised introduction',
            direction: 'owed_to_me',
            settled: false,
          },
        ],
      },
    }),
    'Create existing relationship',
  );
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByRole('combobox', { name: /^Relationship:/ }).click();
  await page.getByRole('option', { name: 'Social · Knows', exact: true }).click();
  await page.getByRole('combobox', { name: /^Search/ }).fill(other.title);
  await page.getByRole('option', { name: new RegExp(`^${other.title}`) }).click();
  await page.getByRole('spinbutton', { name: 'Reconnect cadence (days)' }).fill('21');
  await page.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByRole('dialog', { name: 'Add connection', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden();
  const saved = await expectOkJson<{
    edge: { props: { topics: string[]; favors: { what: string }[]; cadence_target_days: number } };
  }>(await apiGet(page, `/edges/${edge.id}`), 'Saved relationship');
  expect(saved.edge.props.topics).toEqual(['Keep this history']);
  expect(saved.edge.props.favors[0]!.what).toBe('A promised introduction');
  expect(saved.edge.props.cadence_target_days).toBe(21);
  expect(errors).toEqual([]);
});

test('Person bulk unlink retains failures and retries Undo at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', { type: 'person', title: `Bulk owner ${stamp}`, props: {} }),
    'Create scratch owner',
  );
  const pairs = [];
  for (const title of ['Research partner with a longer descriptive name', 'Community partner']) {
    const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
      await apiPost(page, '/nodes', { type: 'person', title: `${title} ${stamp}`, props: {} }),
      'Create scratch partner',
    );
    const { edge } = await expectOkJson<{ edge: { id: string } }>(
      await apiPost(page, '/edges', {
        type: 'KNOWS',
        src: person.id,
        dst: node.id,
        props: { relation: 'colleague' },
      }),
      'Create scratch connection',
    );
    pairs.push({ node, edge });
  }
  await page.goto(`/network/people/${person.id}`);
  const first = pairs[0]!;
  const second = pairs[1]!;
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const { node } of pairs)
      await page
        .getByRole('checkbox', { name: `Select connection to ${node.title}`, exact: true })
        .click();
    const bar = page.getByRole('group', { name: 'Connection bulk actions' });
    await expect(bar).toBeVisible();
    await page.locator('.content').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({
      path: info.outputPath(`bulk-selection-${width}.png`),
      animations: 'disabled',
    });
    const bounds = await bar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const dock = await page.locator('.mobile-dock').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(dock?.y ?? page.viewportSize()!.height);
    await bar.getByRole('button', { name: 'Unlink', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Unlink 2 connections?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(
      dialog.getByText(`${first.node.title} · Colleague`, { exact: true }),
    ).toBeVisible();
    await expectNoA11yViolations(page, '[role="dialog"]');
    await page.screenshot({
      path: info.outputPath(`bulk-confirm-${width}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await bar.getByRole('button', { name: 'Clear' }).click();
  }
  await page.route(`**/api/v1/edges/${second.edge.id}`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'REVIEW_FAILURE', message: 'Fixture unlink failure' } },
        })
      : route.continue(),
  );
  for (const { node } of pairs)
    await page
      .getByRole('checkbox', { name: `Select connection to ${node.title}`, exact: true })
      .click();
  await page
    .getByRole('group', { name: 'Connection bulk actions' })
    .getByRole('button', { name: 'Unlink' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unlink 2' }).click();
  await expect(page.getByText('Unlinked 1 · 1 still selected and not unlinked')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: `Select connection to ${second.node.title}`, exact: true }),
  ).toBeChecked();
  await expect(page.getByRole('link', { name: first.node.title, exact: true })).toBeHidden();
  await page.route(`**/api/v1/edges/${first.edge.id}/restore`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'REVIEW_FAILURE', message: 'Fixture restore failure' } },
    }),
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText("Couldn't undo that change. Try again.")).toBeVisible();
  await page.unroute(`**/api/v1/edges/${first.edge.id}/restore`);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('link', { name: first.node.title, exact: true })).toBeVisible();
  await page.unroute(`**/api/v1/edges/${second.edge.id}`);
  await page
    .getByRole('group', { name: 'Connection bulk actions' })
    .getByRole('button', { name: 'Unlink' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(page.getByRole('link', { name: second.node.title, exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('link', { name: second.node.title, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Person relationship preserves cadence, guards drafts and persists valid edits at three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const { self } = await expectOkJson<{ self: { id: string } }>(
    await apiGet(page, '/auth/me'),
    'Self',
  );
  const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Relationship review ${Date.now()}`,
      props: { headline: 'Community research partner' },
    }),
    'Create scratch person',
  );
  const { edge } = await expectOkJson<{ edge: { id: string } }>(
    await apiPost(page, '/edges', {
      type: 'KNOWS',
      src: self.id,
      dst: node.id,
      props: { relation: 'friend', closeness: 3, cadence_target_days: 14, topics: ['Research'] },
    }),
    'Create scratch relationship',
  );
  await page.goto(`/network/people/${node.id}`);
  await expect(page.getByRole('heading', { name: node.title, exact: true })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'Edit relationship', exact: true }).click();
    const editor = page.getByRole('group', { name: 'Edit relationship', exact: true });
    await editor.scrollIntoViewIfNeeded();
    await page.getByRole('radio', { name: '4 of 5' }).click();
    await expect(page.getByLabel('Reconnect cadence (days)')).toHaveValue('14');
    await page.screenshot({
      path: info.outputPath(`relationship-editor-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.knows-editor');
    await page.getByLabel('Reconnect cadence (days)').fill('1.5');
    await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
    await expect(page.getByText('Check your details', { exact: true })).toBeVisible();
    const editorBounds = await editor.boundingBox();
    expect(editorBounds!.x).toBeGreaterThanOrEqual(0);
    expect(editorBounds!.x + editorBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`relationship-validation-${width}.png`),
      animations: 'disabled',
    });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(discard).toBeVisible();
    await expect(discard.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`relationship-discard-${width}.png`),
      animations: 'disabled',
    });
    await discard.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(editor).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Edit relationship', exact: true }).click();
  await page.getByLabel('Met via').fill('Accessibility research meetup');
  await page.getByLabel('Reconnect cadence (days)').fill('21');
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit relationship', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit relationship', exact: true }).click();
  await expect(page.getByLabel('Met via')).toHaveValue('Accessibility research meetup');
  await expect(page.getByLabel('Reconnect cadence (days)')).toHaveValue('21');
  const summary = await expectOkJson<{
    relationship: { edgeId: string; knowsProps: { topics: string[] } };
  }>(await apiGet(page, `/people/${node.id}/summary`), 'Saved relationship');
  expect(summary.relationship.edgeId).toBe(edge.id);
  expect(summary.relationship.knowsProps.topics).toEqual(['Research']);
  expect(errors).toEqual([]);
});

test('Introduction dialog protects drafts and retries only the unconfirmed favor', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const { self } = await expectOkJson<{ self: { id: string } }>(
    await apiGet(page, '/auth/me'),
    'Self',
  );
  const { node: person } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', { type: 'person', title: `Intro recipient ${stamp}`, props: {} }),
    'Create recipient',
  );
  const { node: broker } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', { type: 'person', title: `Introducer ${stamp}`, props: {} }),
    'Create introducer',
  );
  await expectOkJson(
    await apiPost(page, '/edges', {
      type: 'KNOWS',
      src: self.id,
      dst: broker.id,
      props: { relation: 'friend' },
    }),
    'Create introducer relationship',
  );
  await page.goto(`/network/people/${person.id}`);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'Log introduction', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Log an introduction · ${person.title}` });
    await page.getByPlaceholder('Who made the introduction?').fill(broker.title);
    await page.getByRole('option', { name: new RegExp(broker.title) }).click();
    await page.getByLabel('Context', { exact: true }).fill('Accessibility research meetup');
    await page.screenshot({
      path: info.outputPath(`introduction-draft-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '[role="dialog"]');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  let edgeWrites = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/edges')) edgeWrites += 1;
  });
  await page.route(`**/api/v1/people/${broker.id}/favors`, (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: 'REVIEW_FAILURE', message: 'Review fixture favor failure' } },
    }),
  );
  await page.getByRole('button', { name: 'Log introduction', exact: true }).click();
  await page.getByPlaceholder('Who made the introduction?').fill(broker.title);
  await page.getByRole('option', { name: new RegExp(broker.title) }).click();
  await page
    .getByRole('checkbox', { name: 'Record a favor I owe the person who introduced us' })
    .click();
  await page.getByRole('button', { name: 'Save introduction' }).click();
  await expect(page.getByText('Introduction saved · favor needs review')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry favor only' })).toBeEnabled();
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: info.outputPath(`introduction-partial-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.unroute(`**/api/v1/people/${broker.id}/favors`);
  await page.getByRole('button', { name: 'Retry favor only' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(edgeWrites).toBe(1);
  const { favors } = await expectOkJson<{ favors: { what: string }[] }>(
    await apiGet(page, `/people/${broker.id}/summary`),
    'Introducer favor ledger',
  );
  expect(favors.filter((favor) => favor.what === `Introduced me to ${person.title}`)).toHaveLength(
    1,
  );
  expect(errors).toEqual([]);
});

test('Favor ledger recovers a lost save response without duplication and settles the right row', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { node } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Favor review ${Date.now()}`,
      props: {},
    }),
    'Create scratch person',
  );
  await page.goto(`/network/people/${node.id}`);
  const ledger = page.getByRole('region', { name: /^Favor ledger/ });
  const description =
    'Review the accessible community research proposal and introduce the team to a local partner';
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByLabel('Favor description', { exact: true }).fill(description);
    await ledger.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`favor-draft-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.person-favors');
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Favor description', { exact: true })).toHaveValue(description);
  }
  let requests = 0;
  await page.route(`**/api/v1/people/${node.id}/favors`, async (route) => {
    requests += 1;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({
      status: 503,
      json: {
        error: { code: 'REVIEW_LOST_RESPONSE', message: 'Response interrupted after recording' },
      },
    });
  });
  await page.getByRole('button', { name: 'They owe', exact: true }).click();
  await expect(page.getByText('Favor save not confirmed', { exact: true })).toBeVisible();
  await expect(
    page.locator('.toast').filter({ hasText: 'Response interrupted after recording' }),
  ).toHaveCount(0);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'Retry favor', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`favor-recovery-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.unroute(`**/api/v1/people/${node.id}/favors`);
  await page.getByRole('button', { name: 'Retry favor', exact: true }).click();
  await expect(page.getByLabel('Favor description', { exact: true })).toHaveValue('');
  const { favors } = await expectOkJson<{
    favors: { id: string; what: string; settled: boolean }[];
  }>(await apiGet(page, `/people/${node.id}/summary`), 'Saved favor');
  expect(favors).toHaveLength(1);
  expect(favors[0]!.what).toBe(description);
  expect(requests).toBe(1);
  const favorId = favors[0]!.id;
  await page.route(`**/api/v1/people/${node.id}/favors/${favorId}`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'REVIEW_FAILURE', message: 'Settlement temporarily unavailable' } },
    }),
  );
  await ledger.getByRole('button', { name: 'Settle', exact: true }).click();
  await expect(page.getByText('Settlement not confirmed', { exact: true })).toBeVisible();
  await expect(
    page.locator('.toast').filter({ hasText: 'Settlement temporarily unavailable' }),
  ).toHaveCount(0);
  await expect(
    page.locator('.toast').filter({ hasText: 'Response interrupted after recording' }),
  ).toHaveCount(0);
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await ledger.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`favor-settlement-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.unroute(`**/api/v1/people/${node.id}/favors/${favorId}`);
  await ledger.getByRole('button', { name: 'Settle', exact: true }).click();
  await expect(ledger.getByText('settled', { exact: true })).toBeVisible();
  await page.reload();
  await expect(ledger.getByText('settled', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Connection properties, unlink confirmation and Undo work across three sizes', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stamp = Date.now();
  const { node: person } = await expectOkJson<{ node: { id: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Connection owner ${stamp}`,
      props: {},
    }),
    'Create scratch person',
  );
  const { node: other } = await expectOkJson<{ node: { id: string; title: string } }>(
    await apiPost(page, '/nodes', {
      type: 'person',
      title: `Connection partner ${stamp}`,
      props: {},
    }),
    'Create scratch partner',
  );
  const { edge } = await expectOkJson<{ edge: { id: string } }>(
    await apiPost(page, '/edges', {
      type: 'KNOWS',
      src: person.id,
      dst: other.id,
      props: { relation: 'colleague', closeness: 3, topics: ['Keep this topic'] },
    }),
    'Create scratch connection',
  );
  await page.goto(`/network/people/${person.id}`);
  const row = page
    .locator('.edge-row')
    .filter({ has: page.getByRole('link', { name: other.title, exact: true }) });
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await row.getByRole('button', { name: /^Edit .* properties$/ }).click();
    const popover = page.getByRole('dialog', { name: /^Edit .* properties$/ });
    await popover.getByRole('combobox', { name: 'Relation', exact: true }).click();
    await page.getByRole('option', { name: 'Friend', exact: true }).click();
    await page.screenshot({
      path: info.outputPath(`connection-properties-${width}.png`),
      animations: 'disabled',
    });
    await expectNoA11yViolations(page, '.edge-props-form');
    await popover.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(popover).toBeHidden();
    await row.getByRole('button', { name: `Unlink ${other.title}` }).click();
    const confirm = page.getByRole('dialog', { name: `Unlink ${other.title}?` });
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`connection-unlink-${width}.png`),
      animations: 'disabled',
    });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
  }
  await row.getByRole('button', { name: /^Edit .* properties$/ }).click();
  const popover = page.getByRole('dialog', { name: /^Edit .* properties$/ });
  await popover.getByRole('combobox', { name: 'Relation', exact: true }).click();
  await page.getByRole('option', { name: 'Friend', exact: true }).click();
  await popover.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(popover).toBeHidden();
  const saved = await expectOkJson<{ edge: { props: { relation: string; topics: string[] } } }>(
    await apiGet(page, `/edges/${edge.id}`),
    'Updated connection',
  );
  expect(saved.edge.props.relation).toBe('friend');
  expect(saved.edge.props.topics).toEqual(['Keep this topic']);
  await row.getByRole('checkbox').check();
  await row.getByRole('button', { name: `Unlink ${other.title}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unlink', exact: true }).click();
  await expect(row).toBeHidden();
  await expect(page.getByRole('group', { name: 'Connection bulk actions' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row).toBeVisible();
  expect(errors).toEqual([]);
});
