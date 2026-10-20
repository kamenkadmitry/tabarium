// Opens example.com in the live Chrome, brings it to front and prints the screen position of its link.
// Usage: node scripts/live/native-prep.mjs
import { chromium } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const page = await context.newPage();
await page.goto('https://example.com/');
await page.bringToFront();
await page.waitForTimeout(800);
const pos = await page.evaluate(() => {
  const r = document.querySelector('a').getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  return {
    dpr,
    x: Math.round((window.screenX + (window.outerWidth - window.innerWidth) / 2 + r.x + r.width / 2) * dpr),
    y: Math.round((window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2) * dpr),
    bodyX: Math.round((window.screenX + (window.outerWidth - window.innerWidth) / 2 + 40) * dpr),
    bodyY: Math.round((window.screenY + (window.outerHeight - window.innerHeight) + 300) * dpr),
  };
});
console.log(JSON.stringify(pos));
await browser.close();
