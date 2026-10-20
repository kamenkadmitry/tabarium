import { expect, test, type Page } from '@playwright/test';
import { launchExtension, page as web, type Launched } from './launch';

let app: Launched;

test.beforeAll(async () => {
  app = await launchExtension();
});

test.afterAll(async () => {
  await app.context.close();
});

const library = (id: string) => `chrome-extension://${id}/newtab.html`;

async function openLibraryWithSpace(name: string): Promise<Page> {
  const p = await app.context.newPage();
  await p.goto(library(app.extensionId));
  const first = p.getByRole('button', { name: 'Create your first space' });
  if ((await first.count()) > 0) await first.click();
  else await p.getByRole('button', { name: 'Create space' }).click();
  await p.getByLabel('Space name').fill(name);
  await p.getByRole('button', { name: 'Create', exact: true }).click();
  return p;
}

async function addCollectionWithLinks(p: Page, title: string, links: string[]): Promise<void> {
  await p.getByRole('button', { name: 'New collection' }).click();
  await p.getByLabel('Collection name').fill(title);
  await p.getByRole('button', { name: 'Create', exact: true }).click();
  for (const url of links) {
    await p.locator(`section[aria-label="${title}"]`).getByRole('button', { name: 'Add link' }).click();
    await p.getByLabel('Address').fill(url);
    await p.getByRole('button', { name: 'Add link', exact: true }).last().click();
    await expect(p.locator(`section[aria-label="${title}"] a[href="${url}"]`)).toBeVisible();
  }
}

test('save session reads real tabs, stores them and closes them', async () => {
  const one = await app.context.newPage();
  await one.goto(web('one'));
  const two = await app.context.newPage();
  await two.goto(web('two'));

  const p = await openLibraryWithSpace('Work');
  await p.getByRole('button', { name: 'Save session' }).click();
  const dialog = p.locator('dialog[open]');
  await expect(dialog.getByText('Page one')).toBeVisible();
  await expect(dialog.getByText('Page two')).toBeVisible();
  await dialog.getByLabel('Collection name').fill('Real session');
  await dialog.getByRole('button', { name: 'Add & close tabs' }).click();

  await expect(p.locator('section[aria-label="Real session"] a')).toHaveCount(2);
  await expect.poll(() => one.isClosed()).toBe(true);
  await expect.poll(() => two.isClosed()).toBe(true);
  await p.close();
});

test('open all as a tab group, then replace the window tabs', async () => {
  const p = await openLibraryWithSpace('Browse');
  await addCollectionWithLinks(p, 'Docs', [web('docs-a'), web('docs-b')]);

  await p.getByRole('button', { name: 'Settings' }).click();
  await p.getByRole('switch', { name: 'Open collections as tab groups' }).click();
  await expect(p.getByRole('status')).toContainText('tab groups');
  await p.getByRole('button', { name: 'B Browse', exact: true }).click();

  await p.locator('section[aria-label="Docs"]').getByRole('button', { name: 'Open all tabs' }).click();
  const diagnostics = async () =>
    JSON.stringify({
      alerts: await p.getByRole('alert').allTextContents(),
      tabs: await app.worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url ?? t.pendingUrl)),
      pages: app.context.pages().map((x) => x.url()),
    });
  await expect
    .poll(async () => app.worker.evaluate(async () => (await chrome.tabs.query({})).filter((t) => (t.url ?? t.pendingUrl ?? '').includes('docs-')).length), {
      message: `after Open all: ${await diagnostics()}`,
    })
    .toBe(2);
  const groups = await app.worker.evaluate(() => chrome.tabGroups.query({ title: 'Docs' }));
  expect(groups).toHaveLength(1);

  const stray = await app.context.newPage();
  await stray.goto(web('stray'));
  p.once('dialog', (d) => void d.accept());
  await p.locator('section[aria-label="Docs"]').getByRole('button', { name: 'Collection menu' }).click();
  await p.getByRole('menuitem', { name: 'Replace window tabs' }).click();

  await expect.poll(() => stray.isClosed()).toBe(true);
  await expect.poll(() => app.context.pages().filter((x) => x.url().startsWith(web('docs-'))).length).toBe(2);
  expect(p.isClosed()).toBe(false); // the library itself is kept
  await p.close();
});

test('scheduled backup writes a file and records the time', async () => {
  const p = await app.context.newPage();
  await p.goto(library(app.extensionId));
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.getByRole('switch', { name: 'Automatic backup' }).click();
  await expect(p.getByRole('status')).toContainText('Auto-backup enabled');

  await app.worker.evaluate(() => chrome.alarms.create('tabarium-auto-backup', { when: Date.now() + 300 }));
  await expect(p.getByText(/Last backup:/)).toBeVisible({ timeout: 20_000 });

  const summary = () =>
    app.worker.evaluate(async () =>
      (await chrome.downloads.search({})).map((d) => ({ url: d.url.slice(0, 40), file: d.filename, state: d.state, error: d.error })),
    );
  await expect
    .poll(async () => (await summary()).some((d) => d.url.startsWith('data:application/json') && d.state !== 'interrupted'), {
      message: `downloads seen: ${JSON.stringify(await summary())}`,
      timeout: 15_000,
    })
    .toBe(true);
  await p.close();
});

test('right-click menu: items are registered and saving goes to the Inbox', async () => {
  const p = await app.context.newPage();
  await p.goto(library(app.extensionId));
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.getByRole('switch', { name: 'Right-click menu' }).click();
  await expect(p.getByRole('status')).toContainText('Right-click menu enabled');

  // Creating an item whose id exists is rejected by the browser, which proves the menu was built.
  await expect
    .poll(() =>
      app.worker.evaluate(
        () =>
          new Promise<string | null>((resolve) => {
            chrome.contextMenus.create({ id: 'tabarium-save-page', title: 'probe' }, () =>
              resolve(chrome.runtime.lastError?.message ?? null),
            );
          }),
      ),
    )
    .toMatch(/duplicate id/i);

  await p.evaluate(async (url) => {
    await chrome.runtime.sendMessage({
      type: 'e2e-context-click',
      info: { menuItemId: 'tabarium-save-page' },
      tab: { url, title: 'Saved from menu' },
    });
    await chrome.runtime.sendMessage({
      type: 'e2e-context-click',
      info: { menuItemId: 'tabarium-save-link', linkUrl: 'https://example.test/linked', selectionText: 'A link' },
    });
  }, web('menu-page'));

  await p.reload();
  await p.getByRole('button', { name: 'I Inbox', exact: true }).click();
  const saved = p.locator('section[aria-label="Saved tabs"]');
  await expect(saved.getByText('Saved from menu')).toBeVisible();
  await expect(saved.getByText('A link')).toBeVisible();
  await p.close();
});

test('popup saves every tab of the window into the Inbox', async () => {
  const a = await app.context.newPage();
  await a.goto(web('popup-a'));
  const b = await app.context.newPage();
  await b.goto(web('popup-b'));

  const popup = await app.context.newPage();
  await popup.goto(`chrome-extension://${app.extensionId}/popup.html`);
  await popup.getByRole('button', { name: 'Save all tabs in this window' }).click();
  await expect(popup.getByRole('status')).toContainText(/Saved \d+ of \d+ tabs/);

  const library = await app.context.newPage();
  await library.goto(`chrome-extension://${app.extensionId}/newtab.html`);
  await library.getByRole('button', { name: 'I Inbox', exact: true }).click();
  const saved = library.locator('section[aria-label="Saved tabs"]');
  await expect(saved.getByText('Page popup-a')).toBeVisible();
  await expect(saved.getByText('Page popup-b')).toBeVisible();
});

test('AI: connection test, naming and grouping through a provider', async () => {
  await app.context.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const grouping = body.messages[0]?.content.includes('organise browser tabs');
    const text = grouping ? '[{"title":"Everything","tabs":[1,2,3,4,5,6,7,8,9]}]' : '["Fresh name"]';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
  });

  const p = await app.context.newPage();
  await p.goto(library(app.extensionId));
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.locator('select:has(option:text("OpenAI"))').selectOption('openai');
  await p.getByLabel('Model').fill('test-model');
  await p.getByLabel('API key').fill('sk-e2e');
  await p.getByRole('button', { name: 'Save AI settings' }).click();
  await p.getByRole('button', { name: 'Test connection' }).click();
  await expect(p.getByRole('status')).toContainText('Connection works');
  await p.close();
});

test('the service worker raised no errors', () => {
  expect(app.workerErrors).toEqual([]);
});
