/* global chrome */
// Opens two real sites, then drives "Save session" in the live Chrome. A person answers the permission prompt.
// Usage: node scripts/live/session-flow.mjs <extension-id>
import { chromium } from '@playwright/test';

const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();

for (const url of ['https://example.com/', 'https://example.org/']) {
  const p = await context.newPage();
  await p.goto(url).catch(() => undefined);
}

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
if ((await page.getByRole('button', { name: 'Create your first space' }).count()) > 0) {
  await page.getByRole('button', { name: 'Create your first space' }).click();
  await page.getByLabel('Space name').fill('Live test');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
}
console.log('permissions before:', JSON.stringify(await page.evaluate(() => chrome.permissions.getAll())));
await page.getByRole('button', { name: 'Save session' }).click();
console.log('clicked Save session; waiting up to 90 s for the dialog (answer the permission prompt if it appears)...');
const opened = await page
  .locator('dialog[open]')
  .waitFor({ timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
console.log('dialog opened:', opened);
if (opened) console.log('tabs listed:', await page.locator('dialog[open] li').allInnerTexts());
else console.log('banner:', await page.getByRole('alert').allInnerTexts());
console.log('permissions after:', JSON.stringify(await page.evaluate(() => chrome.permissions.getAll())));
await page.screenshot({ path: '../toby-clone/live-session.png' });
await browser.close();
