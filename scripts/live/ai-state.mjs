// Reports whether AI settings are filled in (never prints the key itself). Usage: node scripts/live/ai-state.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: 'Settings' }).click();
console.log('provider:', await page.locator('select:has(option:text("OpenAI"))').inputValue());
console.log('model:', await page.getByLabel('Model').inputValue().catch(() => '(hidden)'));
console.log('key length:', (await page.getByLabel('API key').inputValue().catch(() => '')).length);
console.log('note:', await page.getByRole('note').innerText().catch(() => '(none)'));
await page.close();
await browser.close();
