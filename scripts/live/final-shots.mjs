/* global chrome */
// Reloads the extension in the live Chrome and screenshots the board (List view) and the side panel page. Usage: node scripts/live/final-shots.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const r = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/`)) ?? (await context.newPage());
if (!r.url().startsWith('chrome-extension://')) await r.goto(`chrome-extension://${id}/newtab.html`);
await r.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 4000));

const lib = await context.newPage();
await lib.setViewportSize({ width: 1500, height: 900 });
await lib.goto(`chrome-extension://${id}/newtab.html`);
await lib.getByRole('button', { name: /^L\s*Live test$/ }).click();
await lib.getByRole('button', { name: 'Change view' }).click();
await lib.getByRole('menuitemradio', { name: 'List' }).click();
await lib.waitForTimeout(500);
await lib.screenshot({ path: '../toby-clone/final-board-list.png' });

const side = await context.newPage();
await side.setViewportSize({ width: 420, height: 800 });
await side.goto(`chrome-extension://${id}/sidepanel.html`);
await side.getByRole('list', { name: 'Spaces' }).getByRole('button').first().click();
await side.waitForTimeout(300);
await side.screenshot({ path: '../toby-clone/final-side.png' });
await browser.close();
