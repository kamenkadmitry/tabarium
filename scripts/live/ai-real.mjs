// Runs the three AI features against the configured provider in the live Chrome. Usage: node scripts/live/ai-real.mjs <id>
import { chromium } from '@playwright/test';

const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const log = (k, v) => console.log(`${k}:`, typeof v === 'string' ? v : JSON.stringify(v));

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);

// 1. Test connection
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByRole('button', { name: 'Test connection' }).click();
await page.locator('[role=status],[role=alert]').first().waitFor({ timeout: 60_000 });
log('Test connection', (await page.locator('[role=status],[role=alert]').allInnerTexts()).join(' | '));

// 2. Suggest name for a collection with real tabs
await page.getByRole('button', { name: /^L\s*Live test$/ }).click();
const menuButton = page.locator('section[aria-label="Live docs"]').getByRole('button', { name: 'Collection menu' });
await menuButton.click();
await page.getByRole('menuitem', { name: /Suggest name/ }).click();
const names = page.locator('dialog[open] button:has(svg)');
const gotNames = await names.first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
if (gotNames) {
  log('Suggested names', await page.locator('dialog[open] li').allInnerTexts());
  await page.locator('dialog[open]').getByRole('button', { name: 'Keep current name' }).click();
} else {
  log('Suggest name failed', await page.getByRole('alert').allInnerTexts());
}

// 3. Organise a session with AI (open a few real sites first so there is something to group)
for (const url of ['https://developer.mozilla.org/', 'https://www.wikipedia.org/', 'https://news.ycombinator.com/']) {
  const p = await context.newPage();
  await p.goto(url, { timeout: 20_000 }).catch(() => undefined);
}
await page.bringToFront();
await page.getByRole('button', { name: 'Save session' }).click();
const dialog = page.locator('dialog[open]');
await dialog.getByRole('button', { name: 'Organise with AI' }).click();
const groups = dialog.locator('section[aria-label="AI groups"]');
const gotGroups = await groups.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
if (gotGroups) log('AI groups', (await groups.innerText()).replace(/\n+/g, ' | '));
else log('Organise failed', await dialog.getByRole('alert').allInnerTexts());
await page.screenshot({ path: '../toby-clone/live-ai-groups.png' });
await dialog.getByRole('button', { name: 'Cancel' }).click();
await browser.close();
