import { expect, test } from '@playwright/test';
import path from 'node:path';
import { launchExtension } from './launch';

test('imports a Linkwarden export through the source picker', async () => {
  const { context, extensionId, workerErrors } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Import…' }).click();
  await page.getByRole('menuitem', { name: 'Linkwarden', exact: true }).click();
  await page.getByLabel('Import source file').setInputFiles(path.resolve('e2e/fixtures/linkwarden.json'));
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible();

  await page.getByRole('button', { name: 'Linkwarden', exact: true }).click();
  // collectionOrder puts Tools first.
  await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
  const card = page.getByRole('link', { name: 'Deep article' });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('href', 'https://example.test/deep');
  // The note icon marks the imported description; the tag chip carries the link's tag.
  await expect(page.getByLabel('Has a note')).toBeVisible();
  await expect(page.getByText('Docs', { exact: true })).toBeVisible();
  // The pinned link arrives starred.
  await expect(page.getByLabel('Starred')).toBeVisible();

  await context.close();
  expect(workerErrors).toEqual([]);
});

test('auto-detect recognises a Linkwarden file without a source choice', async () => {
  const { context, extensionId, workerErrors } = await launchExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Import…' }).click();
  await page.getByRole('menuitem', { name: 'Auto-detect format' }).click();
  await page.getByLabel('Import source file').setInputFiles(path.resolve('e2e/fixtures/linkwarden.json'));
  await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Linkwarden', exact: true })).toBeVisible();

  await context.close();
  expect(workerErrors).toEqual([]);
});
