/* global chrome */
// Revokes the optional "tabs" permission, shows the library and prints the screen position of "Save session".
// Usage: node scripts/live/prompt-prep.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/newtab`)) ?? (await context.newPage());
if (!page.url().startsWith('chrome-extension://')) await page.goto(`chrome-extension://${id}/newtab.html`);
await page.bringToFront();
const removed = await page.evaluate(() => chrome.permissions.remove({ permissions: ['tabs'] }));
console.log('tabs revoked:', removed, JSON.stringify(await page.evaluate(() => chrome.permissions.getAll())));
await page.getByRole('button', { name: /^L\s*Live test$/ }).click();
const box = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Save session'));
  const r = b.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  return {
    x: Math.round((window.screenX + (window.outerWidth - window.innerWidth) / 2 + r.x + r.width / 2) * dpr),
    y: Math.round((window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2) * dpr),
  };
});
console.log(JSON.stringify(box));
await browser.close();
