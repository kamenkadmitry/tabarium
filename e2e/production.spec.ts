import { expect, test } from '@playwright/test';
import { launchExtension, PRODUCTION_BUILD, type Launched } from './launch';

let app: Launched;

test.beforeAll(async () => {
  app = await launchExtension(PRODUCTION_BUILD);
});

test.afterAll(async () => {
  await app.context.close();
});

test('the shipped build starts with only non-warning permissions', async () => {
  const granted = await app.worker.evaluate(() => chrome.permissions.getAll());
  // `newTabPageOverride` is added by Chrome itself for the new tab page and shows no install warning.
  expect(new Set(granted.permissions)).toEqual(new Set(['activeTab', 'sidePanel', 'newTabPageOverride']));
  expect(granted.origins ?? []).toEqual([]);

  for (const permission of ['tabs', 'contextMenus', 'downloads', 'alarms', 'tabGroups', 'history']) {
    const has = await app.worker.evaluate((p) => chrome.permissions.contains({ permissions: [p as chrome.runtime.ManifestPermissions] }), permission);
    expect(has, `${permission} must not be granted at install`).toBe(false);
  }
});

test('the shipped build declares each optional permission and the library works without them', async () => {
  const manifest = await app.worker.evaluate(() => chrome.runtime.getManifest());
  expect(new Set(manifest.optional_permissions)).toEqual(new Set(['tabs', 'contextMenus', 'downloads', 'alarms', 'tabGroups', 'history']));

  const page = await app.context.newPage();
  await page.goto(`chrome-extension://${app.extensionId}/newtab.html`);
  await page.getByRole('button', { name: 'Create your first space' }).click();
  await page.getByLabel('Space name').fill('No permissions needed');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('Collection name').fill('Manual');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Address').fill('example.org');
  await page.getByRole('button', { name: 'Add link', exact: true }).last().click();
  await expect(page.locator('section[aria-label="Manual"] a')).toHaveCount(1);
  expect(app.workerErrors).toEqual([]);
});
