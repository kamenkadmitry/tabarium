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
    await p.locator('form[aria-label="Add link"]').getByRole('button', { name: 'Add link', exact: true }).click();
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
  await p.getByRole('button', { name: 'Browse', exact: true }).click();

  await p.locator('section[aria-label="Docs"]').getByRole('button', { name: 'Open all tabs' }).click();
  const diagnostics = async () =>
    JSON.stringify({
      alerts: await p.getByRole('alert').allTextContents(),
      tabs: await app.worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url ?? t.pendingUrl)),
      pages: app.context.pages().map((x) => x.url()),
    });
  await p.waitForTimeout(2500);
  const opened = await app.worker.evaluate(
    async () => (await chrome.tabs.query({})).filter((t) => (t.url ?? t.pendingUrl ?? '').includes('docs-')).length,
  );
  expect(opened, `after Open all: ${await diagnostics()}`).toBe(2);
  const groups = await app.worker.evaluate(() => chrome.tabGroups.query({ title: 'Docs' }));
  expect(groups).toHaveLength(1);

  const stray = await app.context.newPage();
  await stray.goto(web('stray'));
  p.once('dialog', (d) => void d.accept());
  await p.locator('section[aria-label="Docs"]').getByRole('button', { name: 'Collection menu' }).click();
  await p.getByRole('menuitem', { name: 'Replace window tabs' }).click();

  await expect.poll(() => stray.isClosed()).toBe(true);
  await expect
    .poll(() =>
      app.worker.evaluate(
        async () => (await chrome.tabs.query({})).map((t) => t.url ?? t.pendingUrl ?? '').filter((u) => u.includes('docs-')).length,
      ),
    )
    .toBe(2);
  const urls = await app.worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url ?? t.pendingUrl ?? ''));
  expect(urls.some((u) => u.includes('/newtab.html'))).toBe(true); // the library itself is kept
  expect(urls.some((u) => u.includes('stray'))).toBe(false);
  await p.close();
});

test('open tabs panel: live list, drag into a collection, auto-close and merge windows', async () => {
  const one = await app.context.newPage();
  await one.goto(web('panel-one'));
  const two = await app.context.newPage();
  await two.goto(web('panel-two'));

  const p = await openLibraryWithSpace('Panel');
  await addCollectionWithLinks(p, 'Target', []);
  const panel = p.getByRole('complementary', { name: 'Open tabs' });

  // The list comes from the real browser and follows it.
  await expect(panel.getByRole('button', { name: 'Page panel-one', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Page panel-two', exact: true })).toBeVisible();

  // Drag a real tab into the collection; the tab stays open by default.
  await panel.locator('[data-open-tab-id]', { hasText: 'Page panel-one' }).dragTo(p.locator('section[aria-label="Target"]'));
  await expect(p.locator('section[aria-label="Target"] a[href="https://example.test/panel-one"]')).toBeVisible();
  expect(one.isClosed()).toBe(false);

  // With "close tabs after adding" the dragged tab is closed and leaves the panel.
  await panel.getByLabel('Close tabs after adding them').click(); // saved to settings, so it updates asynchronously
  await expect(panel.getByLabel('Close tabs after adding them')).toBeChecked();
  await panel.locator('[data-open-tab-id]', { hasText: 'Page panel-two' }).dragTo(p.locator('section[aria-label="Target"]'));
  await expect(p.locator('section[aria-label="Target"] a[href="https://example.test/panel-two"]')).toBeVisible();
  await expect.poll(() => two.isClosed()).toBe(true);
  await expect(panel.getByRole('button', { name: 'Page panel-two', exact: true })).toHaveCount(0);

  // A second window shows up as its own block; "Merge windows" pulls its tabs into this one.
  await app.worker.evaluate(() => chrome.windows.create({ url: 'https://example.test/other-window' }));
  await expect(panel.locator('section')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Merge windows' }).click();
  await expect(panel.locator('section')).toHaveCount(1);
  // Matched by address: the moved tab's title may still be loading.
  await expect(panel.locator('[data-open-tab-id] button[title*="/other-window"]')).toBeVisible();
  await p.close();
});

test('open tabs panel: width is adjustable by dragging its edge and is remembered', async () => {
  const p = await openLibraryWithSpace('Resize');
  const panel = p.getByRole('complementary', { name: 'Open tabs' });
  const handle = panel.getByRole('separator', { name: 'Resize the open tabs panel' });
  const width = async () => Math.round((await panel.boundingBox())?.width ?? 0);

  expect(await width()).toBe(288);
  const box = await handle.boundingBox();
  if (!box) throw new Error('The resize handle is not visible');
  const y = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width / 2, y);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 - 100, y, { steps: 5 });
  await p.mouse.up();
  await expect.poll(width).toBeGreaterThan(370);

  // Keyboard: the arrow keys on the focused handle change it too, and the value is saved across reloads.
  await handle.focus();
  await p.keyboard.press('ArrowLeft');
  const saved = await width();
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe(String(saved));
  // Wait until the width is really stored before reloading.
  await expect
    .poll(() =>
      p.evaluate(
        () =>
          new Promise<number | null>((resolve) => {
            const open = indexedDB.open('tabarium');
            open.onsuccess = () => {
              const get = open.result.transaction('settings').objectStore('settings').get('settings');
              get.onsuccess = () => {
                resolve((get.result as { value?: { openTabsWidth?: number } } | undefined)?.value?.openTabsWidth ?? null);
                open.result.close();
              };
            };
          }),
      ),
    )
    .toBe(saved);
  await p.reload();
  await p.getByRole('button', { name: 'Resize', exact: true }).first().click();
  await expect.poll(async () => Math.round((await p.getByRole('complementary', { name: 'Open tabs' }).boundingBox())?.width ?? 0)).toBe(saved);
  await p.close();
});

test('profile: the sidebar shows a Local badge and the name set in Settings', async () => {
  const p = await openLibraryWithSpace('Profile');
  const profile = p.getByRole('button', { name: 'Your profile' });
  await expect(profile).toContainText('My library');
  await expect(profile).toContainText('Local');

  await p.getByRole('button', { name: 'Settings' }).click();
  await p.getByLabel('Name', { exact: true }).fill('Alex');
  await p.getByLabel('Name', { exact: true }).blur();
  await expect(profile).toContainText('Alex');
  await p.close();
});

test('tags and hashtags: own pages, picked or created while adding and editing a link', async () => {
  const p = await openLibraryWithSpace('Labels');
  await addCollectionWithLinks(p, 'Reading', []);

  // Tags page (in the top navigation): create a tag.
  await p.getByRole('button', { name: 'Tags', exact: true }).click();
  await p.getByLabel('Tag name').fill('Work');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(p.getByLabel('Name of tag Work')).toBeVisible();

  // Hashtags page: create one, normalised.
  await p.getByRole('button', { name: 'Hashtags', exact: true }).click();
  await p.getByLabel('Hashtag name').fill('#Machine Learning');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.getByRole('button', { name: /^#machine-learning/ }).click();
  await expect(p.getByLabel('Name of hashtag machine-learning')).toBeVisible();

  // Add a link: pick the existing tag and hashtag, and create a new hashtag right there, all with the "+" chips.
  await p.getByRole('button', { name: 'Labels', exact: true }).first().click();
  await p.locator('section[aria-label="Reading"]').getByRole('button', { name: 'Add link' }).click();
  const form = p.locator('form[aria-label="Add link"]');
  await form.getByLabel('Address').fill('https://example.test/labelled');
  await form.getByLabel('Title').fill('Labelled link');
  await form.getByRole('button', { name: 'Add tag' }).click();
  await form.getByRole('combobox', { name: 'Add tag' }).fill('wor');
  await form.getByRole('option', { name: /Work/ }).click();
  await form.getByRole('button', { name: 'Add hashtag' }).click();
  await form.getByRole('combobox', { name: 'Add hashtag' }).fill('machine');
  await form.getByRole('option', { name: /#machine-learning/ }).click();
  await form.getByRole('combobox', { name: 'Add hashtag' }).fill('rust');
  await form.getByRole('option', { name: /Create #rust/ }).click();
  await form.getByRole('button', { name: 'Add link', exact: true }).click();

  const row = p.locator('section[aria-label="Reading"] li', { hasText: 'Labelled link' });
  await expect(row).toContainText('Work');
  await expect(row).toContainText('#machine-learning');
  await expect(row).toContainText('#rust');

  // The board filter keeps only links with the chosen hashtag.
  await p.getByRole('button', { name: 'Filter collections' }).click();
  await p.getByRole('menuitem', { name: /Hashtags/ }).click();
  await p.getByRole('menuitemcheckbox', { name: /#rust/ }).click();
  await p.keyboard.press('Escape');
  await expect(p.getByRole('button', { name: 'Clear filter #rust' })).toBeVisible();
  await expect(p.locator('section[aria-label="Reading"]')).toContainText('Labelled link');
  await p.getByRole('button', { name: 'Clear filter #rust' }).click();

  // Search finds the link by hashtag.
  await p.getByPlaceholder('Search all tabs, notes and links').fill('#rust');
  await expect(p.getByText('Labelled link').first()).toBeVisible();
  await p.close();
});

test('inline editor: opens under the row, edits title, note and labels, Esc closes it', async () => {
  const p = await openLibraryWithSpace('Inline');
  p.setDefaultTimeout(10_000); // a stuck locator should fail with its name, not hang until the test timeout
  await addCollectionWithLinks(p, 'Notes', ['https://example.test/inline-a', 'https://example.test/inline-b']);
  const section = p.locator('section[aria-label="Notes"]');
  const rowA = section.locator('[data-card-id]', { hasText: 'example.test' }).first();

  // The pencil is revealed by hover (not available to the test driver) or by keyboard focus, so use the keyboard.
  await rowA.getByRole('button', { name: 'Edit tab and note' }).focus();
  await p.keyboard.press('Enter');
  const form = section.locator('form[aria-label="Edit link"]');
  await expect(form).toBeVisible();
  // It sits directly under the edited row, and only one editor exists.
  await expect(p.locator('form[aria-label="Edit link"]')).toHaveCount(1);

  await form.getByLabel('Title').fill('First link, renamed');
  await form.getByLabel('Note').fill('remember this');
  await form.getByRole('button', { name: 'Add hashtag' }).click();
  await form.getByRole('combobox', { name: 'Add hashtag' }).fill('later');
  await form.getByRole('combobox', { name: 'Add hashtag' }).press('Enter');
  await expect(form.getByRole('list', { name: 'Chosen hashtags' })).toContainText('#later');
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(form).toHaveCount(0);
  const saved = section.locator('[data-card-id]', { hasText: 'First link, renamed' });
  await expect(saved).toContainText('#later');

  // Esc closes an editor with no changes without asking.
  // The E key on the focused link opens the editor too.
  await saved.getByRole('link').focus();
  await p.keyboard.press('e');
  await expect(form).toBeVisible();
  await form.getByLabel('Title').press('Escape');
  await expect(form).toHaveCount(0);
  await p.close();
});

test('open tabs panel: shows browser tab groups, groups a selection, finds open tabs in search', async () => {
  const x = await app.context.newPage();
  await x.goto(web('grp-x'));
  const y = await app.context.newPage();
  await y.goto(web('grp-y'));

  const p = await openLibraryWithSpace('Groups');
  const panel = p.getByRole('complementary', { name: 'Open tabs' });

  // "Group" turns the selected tabs into a real browser tab group, and the panel shows it with its title.
  await panel.getByLabel('Select Page grp-x').check();
  await panel.getByLabel('Select Page grp-y').check();
  await panel.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(panel.getByRole('group', { name: /^Tab group Group \d+$/ })).toBeVisible();
  const groups = await app.worker.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => g.title));
  expect(groups.some((t) => /^Group \d+$/.test(t))).toBe(true);

  // A group can be saved as a collection under its own name.
  const groupBox = panel.getByRole('group', { name: /^Tab group Group \d+$/ });
  await groupBox.getByRole('button', { name: /^Save group/ }).click();
  await expect(p.locator('main section h2', { hasText: /^Group \d+$/ })).toBeVisible();

  // Search also finds tabs that are only open (not saved) in the browser.
  await p.getByPlaceholder('Search all tabs').fill('grp-y');
  const open = p.locator('main section[aria-label="Open tabs"]'); // the search results, not the panel
  await expect(open.getByText('Page grp-y')).toBeVisible();
  await p.close();
});

test('board toolbar: view, sort, colour filter and collapse all', async () => {
  const p = await openLibraryWithSpace('Board');
  await addCollectionWithLinks(p, 'Bravo', []);
  await addCollectionWithLinks(p, 'alpha', []);
  await p.locator('section[aria-label="Bravo"]').getByRole('button', { name: 'Collection menu' }).click();
  await p.getByRole('button', { name: 'Orange' }).click();

  const titles = () => p.locator('main section[aria-label] > header h2').allTextContents();
  await expect(p.getByText('2 Collections')).toBeVisible();

  // The layout is remembered per space, also after a reload.
  await p.getByRole('button', { name: 'Change view' }).click();
  await p.getByRole('menuitemradio', { name: 'List' }).click();
  // The button label comes from the stored setting, so once it reads "List" the choice is saved.
  await expect(p.getByRole('button', { name: 'Change view' })).toContainText('List');
  await p.reload();
  await p.getByRole('button', { name: 'Board', exact: true }).first().click(); // a reload shows the first space again
  await expect(p.getByRole('button', { name: 'Change view' })).toContainText('List');

  await p.getByRole('button', { name: 'Sort collections' }).click();
  await p.getByRole('menuitemradio', { name: 'Name A–Z' }).click();
  await expect.poll(titles).toEqual(['alpha', 'Bravo']);

  await p.getByRole('button', { name: 'Filter collections' }).click();
  await p.getByRole('menuitem', { name: /^Colour/ }).click();
  await p.getByRole('menuitemradio', { name: 'Orange' }).click();
  await expect.poll(titles).toEqual(['Bravo']);
  await p.getByRole('button', { name: 'Clear filter Orange' }).click();
  await expect.poll(titles).toEqual(['alpha', 'Bravo']);

  await p.getByRole('button', { name: 'Collapse all' }).click();
  await expect(p.getByRole('button', { name: 'Expand Bravo' })).toHaveAttribute('aria-expanded', 'false');
  await p.getByRole('button', { name: 'Expand all' }).click();
  await expect(p.getByRole('button', { name: 'Collapse Bravo' })).toHaveAttribute('aria-expanded', 'true');
  await p.close();
});

test('toolbar button: side panel by default, switchable to the classic popup and back', async () => {
  // Real browser state: the toolbar button opens the side panel and the popup is empty.
  // The worker applies this shortly after it starts, so poll instead of reading once.
  await expect
    .poll(() =>
      app.worker.evaluate(async () => ({
        popup: await chrome.action.getPopup({}),
        behaviour: await chrome.sidePanel.getPanelBehavior(),
      })),
    )
    .toEqual({ popup: '', behaviour: { openPanelOnActionClick: true } });

  const panel = await app.context.newPage();
  await panel.goto(`chrome-extension://${app.extensionId}/sidepanel.html`);
  await expect(panel.getByText('Prefer the classic popup?')).toBeVisible();
  await panel.getByRole('button', { name: 'Switch back' }).click();
  await expect(panel.getByRole('status')).toContainText('classic popup');
  await expect
    .poll(() => app.worker.evaluate(async () => (await chrome.action.getPopup({})).endsWith('popup.html')))
    .toBe(true);
  expect(await app.worker.evaluate(() => chrome.sidePanel.getPanelBehavior())).toEqual({ openPanelOnActionClick: false });

  // The popup offers the way back.
  const popup = await app.context.newPage();
  await popup.goto(`chrome-extension://${app.extensionId}/popup.html`);
  await popup.getByRole('button', { name: /side panel instead/ }).click();
  await expect(popup.getByRole('status')).toContainText('side panel');
  await expect.poll(() => app.worker.evaluate(async () => await chrome.action.getPopup({}))).toBe('');
  await panel.close();
  await popup.close();
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
  await p.getByRole('button', { name: /^Inbox(?![a-z])/ }).click();
  const saved = p.getByRole('table', { name: 'Inbox' });
  await expect(saved.getByText('Saved from menu')).toBeVisible();
  await expect(saved.getByText('A link')).toBeVisible();
  await p.close();
});

test('popup: Group tabs saves the window into a collection picked space by space', async () => {
  const a = await app.context.newPage();
  await a.goto(web('popup-a'));
  const b = await app.context.newPage();
  await b.goto(web('popup-b'));

  const lib = await openLibraryWithSpace('Quick');
  await addCollectionWithLinks(lib, 'Quick target', []);

  const popup = await app.context.newPage();
  await popup.goto(`chrome-extension://${app.extensionId}/popup.html`);
  // Save tab: a popup opened as a page is not a web page, so there is nothing to save, and it says so.
  await expect(popup.getByText('This page cannot be saved')).toBeVisible();

  await popup.getByRole('tab', { name: 'Group tabs' }).click();
  // The tabs are listed straight away, no button to press.
  await expect(popup.getByText('Page popup-a')).toBeVisible();
  await expect(popup.getByText('Page popup-b')).toBeVisible();
  // Nothing is ticked by default; "Select all" ticks everything.
  await expect(popup.getByRole('button', { name: /^Save \d+ tabs? to a collection$/ })).toBeDisabled();
  await popup.getByLabel('Select all').check();
  await popup.getByRole('button', { name: /^Save \d+ tabs? to a collection$/ }).click();
  await popup.getByRole('button', { name: /^Quick(?![a-z])/ }).click(); // space row (its name ends with the collection count)
  await popup.getByRole('button', { name: 'Quick target', exact: true }).click(); // collection row (not its expander)
  // Pages saved by earlier tests may be among the open tabs; confirm adding them again if asked.
  await popup.getByRole('button', { name: /^Add all, duplicates too/ }).click({ timeout: 2000 }).catch(() => undefined);
  await expect(popup.getByRole('status')).toContainText('to Quick / Quick target');

  await lib.reload();
  await lib.getByRole('button', { name: 'Quick', exact: true }).first().click(); // show the space the popup saved into
  const target = lib.locator('section[aria-label="Quick target"]');
  await expect(target.getByText('Page popup-a')).toBeVisible();
  await expect(target.getByText('Page popup-b')).toBeVisible();
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

test('AI: suggest details in the editor and fill a whole collection', async () => {
  await app.context.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const details = body.messages[0]?.content.includes('sort a personal bookmark library');
    const text = details ? '[{"n":1,"note":"About one.","hashtags":["suggested"]},{"n":2,"note":"About two.","hashtags":["suggested"]}]' : '["Fresh name"]';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
  });

  const p = await openLibraryWithSpace('Fill');
  p.setDefaultTimeout(10_000);
  await p.getByRole('button', { name: 'Settings', exact: true }).click();
  await p.locator('select:has(option:text("OpenAI"))').selectOption('openai');
  await p.getByLabel('Model').fill('test-model');
  await p.getByLabel('API key').fill('sk-e2e');
  await p.getByRole('button', { name: 'Save AI settings' }).click();
  await p.getByRole('button', { name: 'Fill', exact: true }).first().click();

  await addCollectionWithLinks(p, 'Fillme', ['https://example.test/fill-a', 'https://example.test/fill-b']);
  const section = p.locator('section[aria-label="Fillme"]');
  const rows = section.locator('[data-card-id]');

  // One link: the button in the editor adds a note and a hashtag to the form; Save stores them.
  await rows.first().getByRole('button', { name: 'Edit tab and note' }).focus();
  await p.keyboard.press('Enter');
  const form = section.locator('form[aria-label="Edit link"]');
  await form.getByRole('button', { name: 'Suggest with AI' }).click();
  await expect(form.getByRole('status')).toContainText('Added');
  await expect(form.getByLabel('Note')).toHaveValue('About one.');
  await expect(form.getByRole('list', { name: 'Chosen hashtags' })).toContainText('#suggested');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows.first()).toContainText('#suggested');

  // A whole collection: only links without labels are sent, and the proposals are reviewed first.
  await section.getByRole('button', { name: 'Collection menu' }).click();
  await p.getByRole('menuitem', { name: /Fill details/ }).click();
  const dialog = p.locator('dialog[open]');
  await expect(dialog.getByRole('list', { name: 'Suggestions' })).toContainText('About one.');
  await dialog.getByRole('button', { name: 'Apply to 1' }).click();
  await expect(rows.nth(1)).toContainText('#suggested');
  await p.close();
});

test('side panel Inbox: a link leaves the list when it is moved or removed', async () => {
  const lib = await openLibraryWithSpace('Sorting');
  await addCollectionWithLinks(lib, 'Sorted', []);
  // The message goes from a page: a service worker cannot message itself. Other tests leave links in the Inbox too.
  await lib.evaluate(
    (items) => chrome.runtime.sendMessage({ type: 'e2e-save-to-inbox', items }),
    [
      { title: 'Inbox item 1', url: web('inbox-1'), favIconUrl: null },
      { title: 'Inbox item 2', url: web('inbox-2'), favIconUrl: null },
    ],
  );

  const panel = await app.context.newPage();
  panel.setDefaultTimeout(10_000);
  await panel.goto(`chrome-extension://${app.extensionId}/sidepanel.html`);
  await panel.getByRole('tab', { name: /^Inbox/ }).click();
  const list = panel.getByRole('list', { name: 'Inbox' });
  await expect(list).toContainText('Inbox item 1');
  await expect(list).toContainText('Inbox item 2');

  // Move one into a collection: it leaves the Inbox list.
  await panel.getByRole('button', { name: 'Move Inbox item 1 out of Inbox' }).click();
  await panel.getByRole('button', { name: /^Sorting(?![a-z])/ }).click();
  await panel.getByRole('button', { name: 'Sorted', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Moved to Sorting / Sorted');
  await expect(list).not.toContainText('Inbox item 1');
  await expect(list).toContainText('Inbox item 2');

  // Remove the other one: it is gone from the list as well.
  panel.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Remove Inbox item 2 from Inbox' }).click();
  await expect(list).not.toContainText('Inbox item 2');

  await lib.reload();
  await lib.getByRole('button', { name: 'Sorting', exact: true }).first().click();
  await expect(lib.locator('section[aria-label="Sorted"]').getByText('Inbox item 1')).toBeVisible();
  await panel.close();
  await lib.close();
});

test('Inbox is a system space shared by the library and the side panel', async () => {
  const lib = await openLibraryWithSpace('Systemic');
  lib.setDefaultTimeout(10_000);
  const inboxButton = lib.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: /^Inbox(?![a-z])/ });

  // A system space: an envelope icon, and no way to edit or delete it. There is no Next page any more.
  await expect(inboxButton.locator('svg')).toHaveCount(1);
  await expect(lib.getByRole('button', { name: 'Edit space Inbox' })).toHaveCount(0);
  await expect(lib.getByRole('button', { name: 'Delete space Inbox' })).toHaveCount(0);
  await expect(lib.getByRole('button', { name: /^Next/ })).toHaveCount(0);

  await lib.evaluate(
    (items) => chrome.runtime.sendMessage({ type: 'e2e-save-to-inbox', items }),
    [{ title: 'Shared item', url: web('shared-item'), favIconUrl: null }],
  );
  await inboxButton.click();
  const board = lib.locator('main section[aria-label]').filter({ hasText: 'Shared item' });
  await expect(board).toBeVisible();

  // The side panel lists the same links; editing there changes the library at once.
  const panel = await app.context.newPage();
  panel.setDefaultTimeout(10_000);
  await panel.goto(`chrome-extension://${app.extensionId}/sidepanel.html`);
  await panel.getByRole('tab', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: 'Edit Shared item' }).click();
  await panel.getByLabel('Title').fill('Renamed in the panel');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(lib.locator('main').getByText('Renamed in the panel')).toBeVisible();

  // Moving it to the Inbox space from elsewhere and removing it in the library empties the panel list too.
  lib.once('dialog', (d) => void d.accept());
  const row = lib.locator('[data-card-id]', { hasText: 'Renamed in the panel' });
  await row.getByRole('button', { name: 'Delete tab' }).focus();
  await lib.keyboard.press('Enter');
  await expect(panel.getByRole('list', { name: 'Inbox' })).not.toContainText('Renamed in the panel');
  await panel.close();
  await lib.close();
});

test('Inbox page: sort, group by date and site, descriptions read from pages', async () => {
  await app.context.route('https://desc.test/**', async (route) => {
    const second = route.request().url().includes('second');
    const html = `<html><head><meta name="description" content="${second ? 'Read by itself' : 'Read on request'}"></head><body><h1>Heading ${second ? 'two' : 'one'}</h1></body></html>`;
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  const lib = await openLibraryWithSpace('Pages');
  lib.setDefaultTimeout(10_000);
  const seed = (items: { title: string; url: string }[]) =>
    lib.evaluate((list) => chrome.runtime.sendMessage({ type: 'e2e-save-to-inbox', items: list.map((i) => ({ ...i, favIconUrl: null })) }), items);
  await seed([
    { title: 'Zeta page', url: 'https://zeta.test/one' },
    { title: 'Alpha page', url: 'https://desc.test/first' },
  ]);
  await lib.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: /^Inbox(?![a-z])/ }).click();
  const table = lib.getByRole('table', { name: 'Inbox' });

  // Grouped by date by default; sorted and grouped on request.
  await expect(table.getByRole('heading', { name: /^Today/ })).toBeVisible();
  await lib.getByRole('button', { name: 'Sort the Inbox' }).click();
  await lib.getByRole('menuitemradio', { name: 'Title A–Z' }).click();
  // Other tests leave links in the Inbox, so compare the two seeded rows with each other.
  const position = async (text: string) => (await table.locator('[data-card-id]').allTextContents()).findIndex((t) => t.includes(text));
  await expect.poll(async () => (await position('Alpha page')) >= 0 && (await position('Alpha page')) < (await position('Zeta page'))).toBe(true);
  await lib.getByRole('button', { name: 'Group the Inbox' }).click();
  await lib.getByRole('menuitemradio', { name: 'Site' }).click();
  await expect(table.getByRole('heading', { name: /^desc\.test/ })).toBeVisible();
  await expect(table.getByRole('heading', { name: /^zeta\.test/ })).toBeVisible();

  // The description of a page is read once the user asks (access to sites is granted in the test build).
  await lib.getByRole('button', { name: /Load page descriptions/ }).click();
  await expect(table.locator('[data-card-id]', { hasText: 'Alpha page' })).toContainText('Read on request');
  await expect(table.locator('[data-card-id]', { hasText: 'Alpha page' })).toContainText('H1: Heading one');
  // Afterwards new links are read by themselves.
  await seed([{ title: 'Second page', url: 'https://desc.test/second' }]);
  await expect(table.locator('[data-card-id]', { hasText: 'Second page' })).toContainText('Read by itself');
  await lib.close();
});

test('Inbox page: the AI proposes a tag, hashtags and a collection; new ones are created and the link moves', async () => {
  await app.context.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const sorting = body.messages[0]?.content.includes('sort a personal bookmark library');
    const text = sorting
      ? '[{"n":1,"note":"A page about sorting.","tag":"Reference","hashtags":["sorting","algorithms","docs"],"collection":"Triage / Sorted out"}]'
      : '["Fresh name"]';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
  });
  const lib = await openLibraryWithSpace('Triage');
  lib.setDefaultTimeout(10_000);
  await addCollectionWithLinks(lib, 'Sorted out', []);
  await lib.getByRole('button', { name: 'Settings', exact: true }).click();
  await lib.locator('select:has(option:text("OpenAI"))').selectOption('openai');
  await lib.getByLabel('Model').fill('test-model');
  await lib.getByLabel('API key').fill('sk-e2e');
  await lib.getByRole('button', { name: 'Save AI settings' }).click();
  await lib.evaluate(
    (items) => chrome.runtime.sendMessage({ type: 'e2e-save-to-inbox', items }),
    [{ title: 'Needs sorting', url: web('needs-sorting'), favIconUrl: null }],
  );

  await lib.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: /^Inbox(?![a-z])/ }).click();
  // Other tests leave unlabelled links in the Inbox; ticking this one makes it the only link the AI is asked about.
  await lib.getByRole('table', { name: 'Inbox' }).locator('[data-card-id]', { hasText: 'Needs sorting' }).getByRole('checkbox').click();
  await lib.getByRole('button', { name: /Suggest labels and collections/ }).click();
  const dialog = lib.locator('dialog[open]');
  const proposal = dialog.getByRole('list', { name: 'Suggestions' });
  await expect(proposal).toContainText('A page about sorting.');
  await expect(proposal).toContainText('Reference'); // one tag, new
  await expect(proposal).toContainText('#sorting');
  await expect(proposal).toContainText('#algorithms');
  await expect(proposal).toContainText('Triage / Sorted out');
  await dialog.getByRole('button', { name: /^Apply to 1/ }).click();

  // The link left the Inbox, now sits in the suggested collection and carries the new labels.
  await expect(lib.getByRole('table', { name: 'Inbox' }).locator('[data-card-id]', { hasText: 'Needs sorting' })).toHaveCount(0);
  await lib.getByRole('button', { name: 'Triage', exact: true }).click();
  const row = lib.locator('section[aria-label="Sorted out"] [data-card-id]', { hasText: 'Needs sorting' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Reference');
  await expect(row).toContainText('#sorting');
  await lib.close();
});

test('duplicate guard: a link that is already saved is confirmed before it is added again', async () => {
  const p = await openLibraryWithSpace('Dupes');
  p.setDefaultTimeout(10_000);
  await addCollectionWithLinks(p, 'First', ['https://example.test/dupe']);
  await addCollectionWithLinks(p, 'Dupe two', []);
  await addCollectionWithLinks(p, 'Dupe three', []);
  const second = p.locator('section[aria-label="Dupe two"]');
  const dialog = p.locator('dialog[open]');

  // By hand: cancelling adds nothing, confirming creates the duplicate on purpose.
  await second.getByRole('button', { name: 'Add link' }).click();
  const form = p.locator('form[aria-label="Add link"]');
  await form.getByLabel('Address').fill('https://example.test/dupe#part');
  await form.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(dialog).toContainText('already saved');
  await expect(dialog).toContainText('Dupes / First');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(second.locator('[data-card-id]')).toHaveCount(0);
  await form.getByRole('button', { name: 'Add link', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add duplicate' }).click();
  await expect(second.locator('[data-card-id]')).toHaveCount(1);

  // Dropped links: two arrive, one of them is already saved, so only the new one is added.
  const third = p.locator('section[aria-label="Dupe three"]');
  const dt = await p.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData(
      'application/x-tabarium-links',
      JSON.stringify([
        { title: 'Old one', url: 'https://example.test/dupe', favIconUrl: null },
        { title: 'Brand new', url: 'https://example.test/brand-new', favIconUrl: null },
      ]),
    );
    return d;
  });
  await third.dispatchEvent('dragover', { dataTransfer: dt });
  await third.dispatchEvent('drop', { dataTransfer: dt });
  await expect(dialog).toContainText('1 of 2 links are already saved');
  await dialog.getByRole('button', { name: 'Add only the 1 new' }).click();
  await expect(third.locator('[data-card-id]')).toHaveCount(1);
  await expect(third.locator('a[href="https://example.test/brand-new"]')).toBeVisible();
  await p.close();
});

test('dashboard: counts the library and the history, and the period can be switched', async () => {
  const p = await openLibraryWithSpace('Counted');
  p.setDefaultTimeout(10_000);
  await addCollectionWithLinks(p, 'Counted links', ['https://example.test/counted-1', 'https://example.test/counted-2']);
  await p.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  const today = p.getByRole('region', { name: 'Activity today' });
  await p.getByRole('radio', { name: 'Today' }).click();
  await expect(today).toBeVisible();
  // Earlier tests share the profile, so only check that this test's two links are in the numbers.
  const added = Number((await today.getByText('New links').locator('xpath=following-sibling::span[1]').innerText()).replace(/\D/g, ''));
  expect(added).toBeGreaterThanOrEqual(2);
  await expect(p.getByRole('region', { name: 'Library now' })).toContainText('Collections');
  await expect(p.getByRole('img', { name: 'Links added and deleted per day' })).toBeVisible();
  await p.getByRole('radio', { name: 'All time' }).click();
  await expect(p.getByRole('region', { name: 'Activity in total' })).toBeVisible();
  await p.close();
});

test('bookmarks: browser bookmarks are listed, copied into a collection and removed from the browser', async () => {
  const p = await openLibraryWithSpace('Marks');
  p.setDefaultTimeout(10_000);
  const stamp = Date.now();
  await p.evaluate(async (n) => {
    const folder = await chrome.bookmarks.create({ parentId: '1', title: 'E2E folder' });
    await chrome.bookmarks.create({ parentId: folder.id, title: 'First mark', url: `https://example.test/mark-${n}-1` });
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Second mark', url: `https://example.test/mark-${n}-2` });
  }, stamp);

  await p.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const list = p.getByRole('region', { name: 'Browser bookmarks' });
  await list.getByRole('button', { name: /^E2E folder/ }).click();
  await expect(list.getByText('First mark')).toBeVisible();
  await expect(list.getByText('Second mark')).toBeVisible();
  await list.getByRole('textbox', { name: 'Search the bookmarks' }).fill('second mark');
  await expect(list.getByText('First mark')).toHaveCount(0);
  await list.getByRole('textbox', { name: 'Search the bookmarks' }).fill('');

  // Pick one bookmark by hand and send it to the Inbox (a link that is not saved yet, so no duplicate warning).
  await list.getByRole('checkbox', { name: 'Select First mark' }).check();
  await p.getByRole('button', { name: 'Send 1 to Inbox' }).click();
  await expect(p.getByRole('status')).toContainText('Sent 1 bookmark to the Inbox.');
  await expect(list.getByRole('checkbox', { name: 'Select First mark' })).not.toBeChecked();
  await list.getByRole('checkbox', { name: 'Select all in E2E folder' }).check();
  await expect(p.getByRole('button', { name: 'Send 2 to Inbox' })).toBeEnabled();
  await list.getByRole('checkbox', { name: 'Select all in E2E folder' }).uncheck();
  await expect(p.getByRole('button', { name: 'Send 0 to Inbox' })).toBeDisabled();

  await p.getByRole('button', { name: /^Copy \d+ new links?$/ }).click();
  await expect(p.getByRole('status')).toContainText(/Imported \d+ links? into/);
  await list.getByRole('button', { name: /^E2E folder/ }).click().catch(() => undefined);
  await expect(list.getByText('In Tabarium').first()).toBeVisible();

  p.once('dialog', (d) => void d.accept());
  await p.getByRole('button', { name: /^Remove \d+ saved from the browser/ }).click();
  await expect(p.getByRole('status')).toContainText(/Removed \d+ bookmarks? from the browser/);
  await expect(list.getByRole('button', { name: /^E2E folder/ })).toHaveCount(0);
  expect(await p.evaluate(async (n) => (await chrome.bookmarks.search({ url: `https://example.test/mark-${n}-1` })).length, stamp)).toBe(0);

  // The links are in the library now, in the space for browser bookmarks.
  await p.getByRole('button', { name: /^Browser bookmarks\b/ }).click();
  await expect(p.locator('section[aria-label="Bookmarks from the browser"] [data-card-id]', { hasText: 'First mark' })).toBeVisible();
  await p.close();
});

test('links dragged from the side panel can be dropped into a collection', async () => {
  const lib = await openLibraryWithSpace('Dropping');
  await addCollectionWithLinks(lib, 'Target', []);
  const target = lib.locator('section[aria-label="Target"]');
  // The side panel is another page, so the data travels in dataTransfer; here a drag from it is simulated.
  const dt = await lib.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData('application/x-tabarium-links', JSON.stringify([{ title: 'Dropped page', url: 'https://example.test/dropped', favIconUrl: null }]));
    return d;
  });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await expect(target.locator('a[href="https://example.test/dropped"]')).toBeVisible();
  await lib.close();
});

test('Group tabs: the AI proposes browser tab groups and they are created', async () => {
  await app.context.route('https://api.openai.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { messages: { content: string }[] };
    const grouping = body.messages[0]?.content.includes('sort open browser tabs');
    const text = grouping ? '[{"title":"Everything","tabs":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]}]' : '["Fresh name"]';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
  });
  const a = await app.context.newPage();
  await a.goto(web('group-a'));
  const b = await app.context.newPage();
  await b.goto(web('group-b'));

  const lib = await openLibraryWithSpace('Grouping');
  lib.setDefaultTimeout(10_000);
  await lib.getByRole('button', { name: 'Settings', exact: true }).click();
  await lib.locator('select:has(option:text("OpenAI"))').selectOption('openai');
  await lib.getByLabel('Model').fill('test-model');
  await lib.getByLabel('API key').fill('sk-e2e');
  await lib.getByRole('button', { name: 'Save AI settings' }).click();

  const panel = await app.context.newPage();
  panel.setDefaultTimeout(10_000);
  await panel.goto(`chrome-extension://${app.extensionId}/sidepanel.html`);
  await panel.getByRole('tab', { name: 'Group tabs' }).click();
  await panel.getByText('Page group-a').waitFor();
  await panel.getByRole('button', { name: /Organise with AI/ }).click();
  await expect(panel.getByLabel('Name of group 1')).toHaveValue('Everything');
  // Nothing was added to the library: the proposal is only about how the open tabs belong together.
  await panel.getByRole('button', { name: /^Group in the browser/ }).click();
  await expect(panel.getByRole('status')).toContainText('browser tab groups');
  const groups = await app.worker.evaluate(() => chrome.tabGroups.query({}));
  expect(groups.map((g) => g.title)).toContain('Everything');
  await panel.close();
  await lib.close();
});

test('space icons: pick a brand icon from the list and it shows in the sidebar', async () => {
  const p = await openLibraryWithSpace('Iconic');
  p.setDefaultTimeout(10_000);
  const space = p.getByRole('button', { name: 'Iconic', exact: true });
  await expect(space.locator('svg')).toHaveCount(0); // without an icon the first letter is shown

  await p.getByRole('button', { name: 'Edit space Iconic' }).focus();
  await p.keyboard.press('Enter');
  const dialog = p.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Choose icon' }).click();
  await dialog.getByLabel('Search icons').fill('github');
  await dialog.getByRole('button', { name: 'GitHub' }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(space.locator('svg')).toHaveCount(1);
  await p.reload();
  await expect(p.getByRole('button', { name: 'Iconic', exact: true }).locator('svg')).toHaveCount(1);
  await p.close();
});

test('bulk actions: tick links, range-select with Shift, move, star and delete them', async () => {
  const p = await openLibraryWithSpace('Bulk');
  p.setDefaultTimeout(10_000);
  await addCollectionWithLinks(p, 'First', ['https://example.test/b1', 'https://example.test/b2', 'https://example.test/b3', 'https://example.test/b4']);
  await addCollectionWithLinks(p, 'Second', []);
  const first = p.locator('section[aria-label="First"]');
  const second = p.locator('section[aria-label="Second"]');
  const bar = p.getByRole('region', { name: 'Selected links' });
  const boxes = first.getByRole('checkbox', { name: /^Select example/ });

  // One click ticks one link; Shift-click ticks the range up to it.
  await boxes.nth(0).click();
  await expect(bar).toContainText('1 selected');
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(bar).toContainText('3 selected');
  await boxes.nth(1).click(); // untick the middle one again
  await expect(bar).toContainText('2 selected');

  // Move the two to the other collection.
  await bar.getByRole('button', { name: 'Move' }).click();
  const dialog = p.locator('dialog[open]');
  await dialog.getByLabel('Move to collection').selectOption({ label: 'Second' });
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(second.locator('[data-card-id]')).toHaveCount(2);
  await expect(first.locator('[data-card-id]')).toHaveCount(2);
  await expect(bar).toHaveCount(0); // the selection is cleared after the action

  // The header checkbox ticks the whole collection; star, then delete.
  await second.getByRole('checkbox', { name: 'Select all links in Second' }).click();
  await expect(bar).toContainText('2 selected');
  await bar.getByRole('button', { name: 'Star', exact: true }).click();
  await expect(second.getByLabel('Starred')).toHaveCount(2);
  await second.getByRole('checkbox', { name: 'Select all links in Second' }).click();
  p.once('dialog', (d) => void d.accept());
  await bar.getByRole('button', { name: 'Delete' }).click();
  await expect(second.locator('[data-card-id]')).toHaveCount(0);
  await expect(first.locator('[data-card-id]')).toHaveCount(2);
  await p.close();
});

test('the service worker raised no errors', () => {
  expect(app.workerErrors).toEqual([]);
});
