import { expect, test } from '@playwright/test';
import { launchExtension, page } from './launch';

/** Automatic session snapshots: enable in Settings, capture the open windows, restore them back. */
test('session snapshots can be enabled, captured, and restored', async () => {
  const app = await launchExtension();
  const lib = await app.context.newPage();
  await lib.goto(`chrome-extension://${app.extensionId}/newtab.html`);

  // Nothing recorded yet — the list explains how snapshots appear here.
  await lib.getByRole('button', { name: 'Sessions' }).click();
  await expect(lib.getByText('No snapshots yet')).toBeVisible();

  // Two saveable tabs live in one browser window; the library page itself is not snapshot material.
  const a = await app.context.newPage();
  await a.goto(page('snap-a'));
  const b = await app.context.newPage();
  await b.goto(page('snap-b'));

  // Enabling flips the switch; every permission is pre-granted in the e2e build.
  await lib.getByRole('button', { name: 'Settings' }).click();
  await lib.getByRole('switch', { name: 'Automatic session snapshots' }).click();
  await expect(lib.getByRole('status').filter({ hasText: /enabled/i })).toBeVisible();

  // The real alarm waits whole minutes, so the test fires the same capture path directly.
  await lib.evaluate(() => chrome.runtime.sendMessage({ type: 'e2e-take-snapshot' }));

  await lib.getByRole('button', { name: 'Sessions' }).click();
  await expect(lib.getByText('1 window · 2 tabs')).toBeVisible();
  await expect(lib.getByText('Page snap-a')).toBeVisible();
  await expect(lib.getByText('Page snap-b')).toBeVisible();

  // The session is gone; restoring the window brings its tabs back.
  await a.close();
  await b.close();
  await lib.getByRole('button', { name: 'Restore window' }).click();
  await expect
    .poll(async () =>
      app.worker.evaluate(
        async () => (await chrome.tabs.query({ url: ['https://example.test/snap-a', 'https://example.test/snap-b'] })).length,
      ),
    )
    .toBe(2);

  // Deleting removes it from the list.
  await lib.getByRole('button', { name: 'Delete snapshot' }).click();
  await expect(lib.getByText('No snapshots yet')).toBeVisible();

  expect(app.workerErrors).toEqual([]);
});
