/* global chrome */
// Reloads the extension in the live Chrome and prints what the toolbar button is configured to do. Usage: node scripts/live/toolbar-check.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const r = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/`)) ?? (await context.newPage());
if (!r.url().startsWith('chrome-extension://')) await r.goto(`chrome-extension://${id}/newtab.html`);
await r.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 4000));
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
console.log('popup url:', JSON.stringify(await page.evaluate(() => chrome.action.getPopup({}))));
console.log('panel behaviour:', JSON.stringify(await page.evaluate(() => chrome.sidePanel.getPanelBehavior())));
await page.close();
await browser.close();
