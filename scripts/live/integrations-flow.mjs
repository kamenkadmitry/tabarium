/* global chrome */
// Exercises right-click menu, tab groups, replace-window and scheduled backup in the live Chrome.
// A person answers any permission prompt. Usage: node scripts/live/integrations-flow.mjs <extension-id>
import { chromium } from '@playwright/test';

const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const log = (k, v) => console.log(`${k}:`, typeof v === 'string' ? v : JSON.stringify(v));

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
const worker = context.serviceWorkers().find((w) => w.url().includes(id));
const toggle = async (name, expected) => {
  await page.getByRole('switch', { name }).click();
  const status = page.getByRole('status');
  await status.filter({ hasText: expected }).waitFor({ timeout: 90_000 }).catch(() => undefined);
  log(`toggle "${name}"`, (await page.locator('[role=status],[role=alert]').allInnerTexts()).join(' | ') || '(no message)');
};

await page.getByRole('button', { name: 'Settings' }).click();
await toggle('Right-click menu', 'enabled');
await toggle('Open collections as tab groups', 'tab groups');
await toggle('Automatic backup', 'Auto-backup enabled');
log('granted', await page.evaluate(() => chrome.permissions.getAll()));

// 1. Right-click menu items exist (the browser refuses duplicate ids).
if (worker) {
  const probe = (itemId) =>
    worker.evaluate(
      (i) => new Promise((resolve) => chrome.contextMenus.create({ id: i, title: 'probe' }, () => resolve(chrome.runtime.lastError?.message ?? 'NOT REGISTERED')),),
      itemId,
    );
  log('menu item "Save page"', await probe('tabarium-save-page'));
  log('menu item "Save link"', await probe('tabarium-save-link'));
  log('menu item "Save all tabs"', await probe('tabarium-save-all'));
} else log('service worker', 'not found (asleep?)');

// 2. Tab groups + replace window with a real collection.
await page.getByRole('button', { name: /^L\s*Live test$/ }).click();
await page.getByRole('button', { name: 'New collection' }).click();
await page.getByLabel('Collection name').fill('Live docs');
await page.getByRole('button', { name: 'Create', exact: true }).click();
for (const url of ['https://example.com/', 'https://example.org/']) {
  await page.locator('section[aria-label="Live docs"]').getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Address').fill(url);
  await page.getByRole('button', { name: 'Add link', exact: true }).last().click();
}
await page.locator('section[aria-label="Live docs"]').getByRole('button', { name: 'Open all tabs' }).click();
await page.waitForTimeout(2500);
const groups = await page.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => g.title));
log('tab groups after Open all', groups);

const stray = await context.newPage();
await stray.goto('https://example.net/').catch(() => undefined);
page.once('dialog', (d) => void d.accept());
await page.locator('section[aria-label="Live docs"]').getByRole('button', { name: 'Collection menu' }).click();
await page.getByRole('menuitem', { name: 'Replace window tabs' }).click();
await page.waitForTimeout(3000);
log('stray tab closed by Replace', stray.isClosed());
log('tabs now', await page.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url)));

// 3. Scheduled backup: fire the alarm now.
if (worker) {
  await worker.evaluate(() => chrome.alarms.create('tabarium-auto-backup', { when: Date.now() + 500 }));
  await page.getByRole('button', { name: 'Settings' }).click().catch(() => undefined);
  await page.getByText(/Last backup:/).waitFor({ timeout: 20_000 }).catch(() => undefined);
  log('backup status line', (await page.getByText(/Last backup:|Saves a JSON/).allInnerTexts()).join(' | '));
  log('downloads', await worker.evaluate(async () => (await chrome.downloads.search({})).map((d) => ({ file: d.filename, state: d.state, error: d.error }))));
}
await browser.close();
