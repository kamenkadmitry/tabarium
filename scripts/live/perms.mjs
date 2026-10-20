/* global chrome */
// Prints the permissions currently granted to the extension in the live Chrome.
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
console.log(JSON.stringify(await page.evaluate(() => chrome.permissions.getAll()), null, 1));
await page.close();
await browser.close();
