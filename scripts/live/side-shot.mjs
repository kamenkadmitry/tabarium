// Screenshots the side panel page with a space opened. Usage: node scripts/live/side-shot.mjs <id>
import { chromium } from '@playwright/test';
const id = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const [context] = browser.contexts();
const side = await context.newPage();
await side.setViewportSize({ width: 420, height: 800 });
await side.goto(`chrome-extension://${id}/sidepanel.html`);
await side.waitForTimeout(1200);
console.log('body:', (await side.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
const spaces = side.getByRole('list', { name: 'Spaces' }).getByRole('button');
console.log('space buttons:', await spaces.count());
if ((await spaces.count()) > 0) await spaces.first().click();
await side.waitForTimeout(300);
await side.screenshot({ path: '../toby-clone/final-side.png' });
await browser.close();
