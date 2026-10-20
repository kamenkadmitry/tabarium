// Closes stray tabs, opens example.com and example.org, activates example.com and prints the screen position of its link.
import { chromium } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
for (const p of context.pages()) if (!p.url().startsWith('chrome-extension://')) await p.close().catch(() => undefined);
for (const url of ['https://example.org/', 'https://example.com/']) {
  const p = await context.newPage();
  await p.goto(url).catch(() => undefined);
}
const page = context.pages().find((p) => p.url().startsWith('https://example.com'));
await page.bringToFront();
await page.waitForTimeout(800);
const pos = await page.evaluate(() => {
  const r = document.querySelector('a').getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  return {
    x: Math.round((window.screenX + (window.outerWidth - window.innerWidth) / 2 + r.x + r.width / 2) * dpr),
    y: Math.round((window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2) * dpr),
  };
});
console.log(JSON.stringify(pos), 'pages:', context.pages().map((p) => p.url()).join(' '));
await browser.close();
