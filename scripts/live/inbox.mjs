// Lists what the right-click menu saved into Inbox / Saved tabs. Usage: node scripts/live/inbox.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: 'I Inbox', exact: true }).click();
const section = page.locator('section[aria-label="Saved tabs"]');
console.log('Inbox / Saved tabs:', JSON.stringify(await section.locator('[data-card-id] a').allInnerTexts()));
await page.close();
await browser.close();
