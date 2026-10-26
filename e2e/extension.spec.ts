import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3-e2e');

let context: BrowserContext;
let extensionId: string;
const workerErrors: string[] = [];

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tabarium-e2e-')), {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--headless=new'],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  worker.on('console', (m) => m.type() === 'error' && workerErrors.push(m.text()));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

test('new tab page: create a space, a collection and a link, then reload and keep the data', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  await page.getByRole('button', { name: 'Create your first space' }).click();
  await page.getByLabel('Space name').fill('Work');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('Collection name').fill('Reading');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Address').fill('example.com/article');
  await page.locator('form[aria-label="Add link"]').getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('link', { name: /example\.com/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
  await expect(page.getByRole('link', { name: /example\.com/ })).toBeVisible();
});

test('settings: export produces a valid backup that restores after deletion', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Export…' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Tabarium backup (JSON)' }).click(),
  ]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tabarium-backup-')), 'backup.json');
  await download.saveAs(file);

  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.getByRole('button', { name: 'Collection menu' }).click();
  await page.getByRole('menuitem', { name: 'Delete collection' }).click();
  await expect(page.getByRole('heading', { name: 'Reading' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Backup file').setInputFiles(file);
  await expect(page.getByRole('status').filter({ hasText: 'Restored' })).toBeVisible();

  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
});

test('popup renders and the service worker started without errors', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('tab', { name: 'Save tab' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Group tabs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Inbox' })).toBeVisible();
  expect(workerErrors).toEqual([]);
});
