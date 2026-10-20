// Brings the live Chrome tab whose URL contains the given text to the front. Usage: node scripts/live/front.mjs <url-fragment>
import { chromium } from '@playwright/test';
const needle = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = context.pages().find((p) => p.url().includes(needle));
if (!page) throw new Error(`no tab with ${needle}`);
await page.bringToFront();
console.log('front:', page.url());
await browser.close();
