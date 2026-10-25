// Dumps every axe violation per main screen of the e2e build. Run: node scripts/axe-dump.mjs
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const build = path.resolve('.output/chrome-mv3-e2e');
const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tabarium-axe-')), {
  headless: false,
  args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`, '--headless=new'],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const id = new URL(worker.url()).host;
await context.route('https://example.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>P</title>' }));
const lib = await context.newPage();
await lib.goto(`chrome-extension://${id}/newtab.html`);
await lib.getByRole('button', { name: 'Create your first space' }).click();
await lib.getByLabel('Space name').fill('Work');
await lib.getByRole('button', { name: 'Create', exact: true }).click();
await lib.getByRole('button', { name: 'New collection' }).click();
await lib.getByLabel('Collection name').fill('Reading');
await lib.getByRole('button', { name: 'Create', exact: true }).click();
await lib.getByRole('button', { name: 'Add link' }).click();
await lib.getByLabel('Address').fill('example.test/article');
await lib.locator('form[aria-label="Add link"]').getByRole('button', { name: 'Add link', exact: true }).click();
await lib.waitForTimeout(300);

const dump = async (where) => {
  const r = await new AxeBuilder({ page: lib }).analyze();
  for (const v of r.violations) {
    console.log(`${where} | ${v.impact} | ${v.id} | ${v.nodes.map((n) => n.target.join(' ')).join(' ;; ').slice(0, 500)}`);
  }
};
await dump('board');
for (const name of ['Dashboard', 'Starred', 'Duplicates', 'Bookmarks', 'Tags', 'Hashtags', 'Groups Organizer', 'Sessions', 'Settings']) {
  await lib.getByRole('button', { name }).first().click();
  await lib.waitForTimeout(200);
  await dump(name);
}
await lib.getByRole('button', { name: 'Work', exact: true }).click();
await lib.getByRole('button', { name: 'New collection' }).click();
await lib.waitForTimeout(200);
await dump('dialog');
await lib.keyboard.press('Escape');
await lib.keyboard.press('Control+k');
await lib.waitForTimeout(200);
await dump('palette');
await context.close();
