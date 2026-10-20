/* global chrome */
// Reloads the extension and screenshots the key/provider mismatch hint without saving anything. Usage: node scripts/live/hint-shot.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const r = await context.newPage();
await r.goto(`chrome-extension://${id}/newtab.html`);
await r.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 3000));
if (!r.isClosed()) await r.close();
const page = await context.newPage();
await page.setViewportSize({ width: 1100, height: 1300 });
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: 'Settings' }).click();
await page.locator('select:has(option:text("OpenAI"))').selectOption('openai'); // deliberately wrong; not saved
await page.getByLabel('API key').scrollIntoViewIfNeeded();
console.log('hint:', (await page.getByRole('alert').allInnerTexts()).join(' | '));
await page.screenshot({ path: '../toby-clone/live-hint.png' });
await page.close();
await browser.close();
