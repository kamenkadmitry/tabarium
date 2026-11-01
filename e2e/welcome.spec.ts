import { expect, test } from '@playwright/test';
import path from 'node:path';
import { launchExtension } from './launch';

test('first run: the welcome screen explains the map and the example space lands on the board', async () => {
  const { context, extensionId, workerErrors } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  // The short guide: space, collection, side panel, open tabs.
  await expect(page.getByRole('heading', { name: 'Welcome to Tabarium' })).toBeVisible();
  await expect(page.getByText(/a board for a part of your life/)).toBeVisible();
  await expect(page.getByText(/the fastest way to save the tab/)).toBeVisible();
  await expect(page.getByText(/drag them onto the board/)).toBeVisible();

  await page.getByRole('button', { name: 'Try an example space' }).click();
  // The example space opens by itself; its collections are visible.
  await expect(page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Example', exact: true })).toBeVisible();
  await expect(page.locator('section[aria-label="Reading"]')).toContainText('Hacker News');
  await expect(page.locator('section[aria-label="Documentation"]')).toContainText('MDN Web Docs');

  await context.close();
  expect(workerErrors).toEqual([]);
});

test('first run: the welcome screen imports a Toby export', async () => {
  const { context, extensionId, workerErrors } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  await page.locator('input[type="file"]').setInputFiles(path.resolve('e2e/fixtures/toby.json'));
  await expect(page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Imported', exact: true })).toBeVisible();
  await expect(page.locator('section[aria-label="Work tools"]')).toContainText('Board');

  await context.close();
  expect(workerErrors).toEqual([]);
});
