// Usage: node scripts/live/shot.mjs <url> <outfile>
import { chromium } from '@playwright/test';
const [url, out] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
