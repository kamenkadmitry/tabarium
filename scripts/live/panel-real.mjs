/* global chrome */
// Reloads the extension in the live Chrome, then drags real open tabs into a collection. Usage: node scripts/live/panel-real.mjs <id>
import { chromium } from '@playwright/test';

const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const log = (k, v) => console.log(`${k}:`, typeof v === 'string' ? v : JSON.stringify(v));

const r = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/`)) ?? (await context.newPage());
if (!r.url().startsWith('chrome-extension://')) await r.goto(`chrome-extension://${id}/newtab.html`);
await r.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 3500));

for (const url of ['https://developer.mozilla.org/', 'https://www.wikipedia.org/']) {
  const p = await context.newPage();
  await p.goto(url, { timeout: 20_000 }).catch(() => undefined);
}
const page = await context.newPage();
await page.setViewportSize({ width: 1500, height: 900 });
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: /^L\s*Live test$/ }).click();
const panel = page.getByRole('complementary', { name: 'Open tabs' });
await panel.locator('[data-open-tab-id]').first().waitFor({ timeout: 15_000 });
log('windows', await panel.locator('section h3').allTextContents());
log('tabs in panel', await panel.locator('[data-open-tab-id] button[title]').allTextContents());

await page.getByRole('button', { name: 'New collection' }).click();
await page.getByLabel('Collection name').fill('Dragged from browser');
await page.getByRole('button', { name: 'Create', exact: true }).click();
const target = page.locator('section[aria-label="Dragged from browser"]');
const mdn = panel.locator('[data-open-tab-id]', { hasText: 'MDN' }).first();
const wiki = panel.locator('[data-open-tab-id]', { hasText: 'Wikipedia' }).first();
await mdn.dragTo(target);
await wiki.dragTo(target);
await page.waitForTimeout(600);
log('cards in collection', await target.locator('[data-card-id] a span.font-medium').allTextContents());
await page.screenshot({ path: '../toby-clone/live-panel.png' });
await browser.close();
