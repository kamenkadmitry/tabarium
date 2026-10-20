// Drives the AI settings flow in the live Chrome. The browser's own permission prompt must be clicked by a person.
// Usage: node scripts/live/ai-flow.mjs <extension-id>   (uses a deliberately invalid test key)
/* global chrome */
import { chromium } from '@playwright/test';

const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();

// Reload the unpacked extension so the latest build is used.
const reloader = await context.newPage();
await reloader.goto(`chrome-extension://${id}/newtab.html`);
await reloader.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 3000));
if (!reloader.isClosed()) await reloader.close();

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/newtab.html`);
await page.getByRole('button', { name: 'Settings' }).click();
await page.locator('select:has(option:text("OpenAI"))').selectOption('openai');
console.log('model prefilled with:', await page.getByLabel('Model').inputValue());
console.log('note before key:', await page.getByRole('note').innerText());
await page.getByLabel('API key').fill('sk-invalid-test-key');
await page.getByRole('button', { name: 'Save AI settings' }).click();
await page.waitForTimeout(500);
console.log('note after save:', await page.getByRole('note').innerText());

console.log('clicking Test connection; waiting up to 90 s for the permission prompt to be answered...');
await page.getByRole('button', { name: 'Test connection' }).click();
const outcome = await Promise.race([
  page.getByRole('status').waitFor({ timeout: 90_000 }).then(() => 'status'),
  page.getByRole('alert').waitFor({ timeout: 90_000 }).then(() => 'alert'),
]).catch(() => 'timeout (no answer to the prompt?)');
console.log('outcome:', outcome);
console.log('status/alert text:', await page.locator('[role=status],[role=alert]').allInnerTexts());
await page.screenshot({ path: '../toby-clone/live-ai.png' });
await browser.close();
