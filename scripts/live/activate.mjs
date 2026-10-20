/* global chrome */
// Closes view-source tabs and activates the tab whose URL contains the fragment. Usage: node scripts/live/activate.mjs <id> <url-fragment>
import { chromium } from '@playwright/test';
const [id, needle] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/`)) ?? (await context.newPage());
if (!page.url().startsWith('chrome-extension://')) await page.goto(`chrome-extension://${id}/newtab.html`);
const result = await page.evaluate(async (fragment) => {
  const tabs = await chrome.tabs.query({});
  const junk = tabs.filter((t) => (t.url ?? '').startsWith('view-source:')).map((t) => t.id);
  if (junk.length) await chrome.tabs.remove(junk);
  const target = tabs.find((t) => (t.url ?? '').includes(fragment));
  if (!target) return { error: 'tab not found', urls: tabs.map((t) => t.url) };
  await chrome.tabs.update(target.id, { active: true });
  await chrome.windows.update(target.windowId, { focused: true });
  return { activated: target.url, closed: junk.length };
}, needle);
console.log(JSON.stringify(result));
await browser.close();
