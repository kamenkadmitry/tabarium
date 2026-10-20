// Switches the saved AI provider/model in the live Chrome, keeping the saved key. Usage: node scripts/live/ai-provider.mjs <id> <provider-value> <model>
import { chromium } from '@playwright/test';
const [id, provider, model] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: 'Settings' }).click();
const key = await page.getByLabel('API key').inputValue();
await page.locator('select:has(option:text("OpenAI"))').selectOption(provider);
await page.getByLabel('Model').fill(model);
await page.getByLabel('API key').fill(key);
await page.getByRole('button', { name: 'Save AI settings' }).click();
await page.waitForTimeout(500);
console.log('saved:', await page.getByRole('note').innerText());
await page.close();
await browser.close();
