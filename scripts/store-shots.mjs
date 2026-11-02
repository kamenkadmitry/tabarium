/**
 * Renders the Chrome Web Store screenshots and promo tiles into ../store/.
 * Runs against the e2e build (.output/chrome-mv3-e2e) so the optional-permission features
 * (Open tabs, Inbox, …) are visible without unclickable browser prompts; the UI is identical
 * to the release build. Usage: node scripts/store-shots.mjs   (needs the e2e build present)
 */
/* global chrome -- used inside page.evaluate, which runs in the extension page's context */
import { chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, '.output/chrome-mv3-e2e');
const OUT = path.join(ROOT, 'store');
mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
mkdirSync(path.join(OUT, 'tiles'), { recursive: true });

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tabarium-store-')), {
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`, '--headless=new'],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;
const ext = (p) => `chrome-extension://${extensionId}/${p}`;
const web = (n) => `https://example.test/${n}`;

await context.route('https://example.test/**', (route) => {
  const name = new URL(route.request().url()).pathname.slice(1) || 'home';
  const title = name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return route.fulfill({ contentType: 'text/html', body: `<title>${title}</title><h1>${title}</h1>` });
});

const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'screenshots', name) });
  console.log('screenshots/' + name);
};

async function addCollection(title, links) {
  await page.getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('Collection name').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  for (const [url, linkTitle] of links) {
    await page.locator(`section[aria-label="${title}"]`).getByRole('button', { name: 'Add link' }).click();
    const form = page.locator('form[aria-label="Add link"]');
    await form.getByLabel('Address').fill(url);
    if (linkTitle) await form.getByLabel('Title').fill(linkTitle);
    await form.getByRole('button', { name: 'Add link', exact: true }).click();
  }
}

// --- Seed a realistic board -------------------------------------------------
await page.goto(ext('newtab.html'));
const first = page.getByRole('button', { name: /Create your first space|Create space/ });
await first.first().click();
await page.getByLabel('Space name').fill('Work');
await page.getByRole('button', { name: 'Create', exact: true }).click();

await addCollection('Reading', [
  ['https://example.test/typescript-handbook', 'TypeScript Handbook'],
  ['https://example.test/react-patterns', 'React patterns deep-dive'],
  ['https://example.test/css-tricks-grid', 'A complete guide to CSS Grid'],
]);
await addCollection('Tools', [
  ['https://example.test/playwright-docs', 'Playwright documentation'],
  ['https://example.test/vite-guide', 'Vite: guide'],
  ['https://example.test/lucide-icons', 'Lucide icons'],
]);

// Create a tag and a hashtag on their pages, then attach them from the add-link form.
await page.getByRole('button', { name: 'Tags', exact: true }).click();
await page.getByLabel('Tag name').fill('Work');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('button', { name: 'Hashtags', exact: true }).click();
await page.getByLabel('Hashtag name').fill('#papers');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Work', exact: true }).click();
await page.locator('section[aria-label="Reading"]').getByRole('button', { name: 'Add link' }).click();
const form = page.locator('form[aria-label="Add link"]');
await form.getByLabel('Address').fill('https://example.test/ml-paper');
await form.getByLabel('Title').fill('Attention is all you need');
await form.getByRole('button', { name: 'Add tag' }).click();
await form.getByRole('combobox', { name: 'Add tag' }).fill('wor');
await form.getByRole('option', { name: /Work/ }).click();
await form.getByRole('button', { name: 'Add hashtag' }).click();
await form.getByRole('combobox', { name: 'Add hashtag' }).fill('paper');
await form.getByRole('option', { name: /#papers/ }).click();
await form.getByRole('button', { name: 'Add link', exact: true }).click();
await page.locator('form[aria-label="Add link"]').waitFor({ state: 'hidden' });

await shot('01-dashboard.png');

// --- Side panel / Inbox ------------------------------------------------------
await page.evaluate((items) => chrome.runtime.sendMessage({ type: 'e2e-save-to-inbox', items }), [
  { title: 'Article to read later', url: 'https://example.test/article', favIconUrl: null },
  { title: 'Interesting thread', url: 'https://example.test/thread', favIconUrl: null },
  { title: 'Release notes v2', url: 'https://example.test/notes', favIconUrl: null },
]);
await page.goto(ext('sidepanel.html'));
await page.getByRole('tab', { name: /Inbox/ }).click();
await page.getByRole('list', { name: 'Inbox' }).waitFor();
await shot('02-sidepanel.png');

// --- Open tabs panel ---------------------------------------------------------
const t1 = await context.newPage(); await t1.goto(web('design-review'));
const t2 = await context.newPage(); await t2.goto(web('sprint-board'));
const t3 = await context.newPage(); await t3.goto(web('api-reference'));
await page.goto(ext('newtab.html'));
await page.getByRole('complementary', { name: 'Open tabs' }).getByRole('button', { name: 'Design Review', exact: true }).waitFor();
await shot('03-open-tabs.png');
await Promise.all([t1.close(), t2.close(), t3.close()]);

// --- Tags page ---------------------------------------------------------------
await page.goto(ext('newtab.html'));
await page.getByRole('button', { name: 'Tags', exact: true }).click();
await page.getByLabel('Tag name').waitFor();
await shot('04-tags.png');

// --- Settings ----------------------------------------------------------------
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByRole('heading', { name: 'Settings' }).waitFor();
await shot('05-settings.png');
await page.close();

// --- Promo tiles -------------------------------------------------------------
const icon = readFileSync(path.join(ROOT, 'public/icon/128.png')).toString('base64');
const tileHtml = (w, h, size) => `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${size * 0.16}px;background:linear-gradient(135deg,#0f766e 0%,#0d9488 55%,#14b8a6 100%);font-family:Manrope,system-ui,sans-serif">
<img src="data:image/png;base64,${icon}" style="width:${size}px;height:${size}px;filter:drop-shadow(0 6px 18px rgb(0 0 0/.3))">
<div style="color:#fff"><div style="font-size:${size * 0.42}px;font-weight:800;letter-spacing:-.02em;line-height:1">Tabarium</div>
<div style="font-size:${size * 0.17}px;opacity:.92;margin-top:${size * 0.1}px">Your links, on your new tab.<br>Local-first — no account, no cloud.</div></div></body></html>`;

for (const [w, h, size, name] of [
  [440, 280, 96, 'promo-440x280.png'],
  [1400, 560, 200, 'marquee-1400x560.png'],
]) {
  const t = await context.newPage();
  await t.setViewportSize({ width: w, height: h });
  await t.setContent(tileHtml(w, h, size));
  await t.screenshot({ path: path.join(OUT, 'tiles', name) });
  console.log('tiles/' + name);
  await t.close();
}

await context.close();
console.log('done');
