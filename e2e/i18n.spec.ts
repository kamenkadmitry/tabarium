import { expect, test } from '@playwright/test';
import { launchExtension, type Launched } from './launch';

let app: Launched;

test.beforeAll(async () => {
  app = await launchExtension();
});

test.afterAll(async () => {
  await app.context.close();
});

const library = (id: string) => `chrome-extension://${id}/newtab.html`;

test('language: the Settings selector re-renders the whole UI and survives a reload', async () => {
  const p = await app.context.newPage();
  await p.goto(library(app.extensionId));

  // The test browser speaks English, so System resolves to English.
  await expect(p.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.lang)).toBe('en');

  await p.getByRole('button', { name: 'Settings' }).click();
  await p.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Русский' }).click();

  // The switch is live: navigation re-renders and <html lang> follows.
  await expect(p.getByRole('button', { name: 'Сводка' })).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.lang)).toBe('ru');

  // The choice is persisted: a freshly opened page starts in Russian.
  const p2 = await app.context.newPage();
  await p2.goto(library(app.extensionId));
  await expect(p2.getByRole('button', { name: 'Сводка' })).toBeVisible();
  expect(await p2.evaluate(() => document.documentElement.lang)).toBe('ru');

  // Other shipped languages switch the same way.
  await p2.getByRole('button', { name: 'Настройки' }).click();
  await p2.getByRole('radiogroup', { name: 'Язык' }).getByRole('radio', { name: 'Polski' }).click();
  await expect(p2.getByRole('button', { name: 'Pulpit' })).toBeVisible();
  expect(await p2.evaluate(() => document.documentElement.lang)).toBe('pl');

  // Back to the system language so the run leaves no trace for other specs.
  await p2.getByRole('radiogroup', { name: 'Język' }).getByRole('radio', { name: 'Systemowy' }).click();
  await expect(p2.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  expect(await p2.evaluate(() => document.documentElement.lang)).toBe('en');
  await p2.close();
  await p.close();
});
