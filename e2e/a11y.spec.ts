import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { launchExtension } from './launch';

/** Formats axe violations for the assertion message: rule, impact, and where each node lives. */
function describeViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>): string {
  return results.violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n')}`)
    .join('\n');
}

/** Serious or critical axe findings fail the run; moderate/minor are reported but tolerated. */
async function expectClean(p: import('@playwright/test').Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page: p }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad,
    `${where}:\n${describeViolations({ ...results, violations: bad } as Awaited<ReturnType<AxeBuilder['analyze']>>)}`,
  ).toEqual([]);
}

test('axe: no serious or critical violations on the main screens', async () => {
  const app = await launchExtension();
  const lib = await app.context.newPage();
  // Color transitions would otherwise leak half-blended colors into the scan; reduced motion makes them instant.
  await lib.emulateMedia({ reducedMotion: 'reduce' });
  await lib.goto(`chrome-extension://${app.extensionId}/newtab.html`);

  // Seed one space, one collection, one link through the UI so every view has content.
  await lib.getByRole('button', { name: 'Create your first space' }).click();
  await lib.getByLabel('Space name').fill('Work');
  await lib.getByRole('button', { name: 'Create', exact: true }).click();
  await lib.getByRole('button', { name: 'New collection' }).click();
  await lib.getByLabel('Collection name').fill('Reading');
  await lib.getByRole('button', { name: 'Create', exact: true }).click();
  await lib.getByRole('button', { name: 'Add link' }).click();
  await lib.getByLabel('Address').fill('example.test/article');
  await lib.locator('form[aria-label="Add link"]').getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(lib.getByRole('link', { name: /example\.test/ })).toBeVisible();

  await expectClean(lib, 'space board');

  for (const name of ['Dashboard', 'Starred', 'Duplicates', 'Bookmarks', 'Tags', 'Hashtags', 'Groups Organizer', 'Sessions', 'Settings']) {
    await lib.getByRole('button', { name }).first().click();
    // Let React commit the view switch and a paint settle before measuring colours.
    await lib.waitForTimeout(150);
    await expectClean(lib, name);
  }

  // A dialog must hold focus and label its controls.
  await lib.getByRole('button', { name: 'Work', exact: true }).click();
  await lib.getByRole('button', { name: 'New collection' }).click();
  await expectClean(lib, 'new-collection dialog');
  await lib.keyboard.press('Escape');

  // The command palette dialog.
  await lib.keyboard.press('Control+k');
  await expectClean(lib, 'command palette');
  await lib.keyboard.press('Escape');

  // Same check under the dark token set (prefers-color-scheme drives it when theme is "system").
  await lib.emulateMedia({ colorScheme: 'dark' });
  await lib.waitForTimeout(150);
  await expectClean(lib, 'space board dark');
  await lib.getByRole('button', { name: 'Settings' }).click();
  await lib.waitForTimeout(150);
  await expectClean(lib, 'settings dark');

  expect(app.workerErrors).toEqual([]);
});

test('keyboard: dialogs move focus inside and every icon button is named', async () => {
  const app = await launchExtension();
  const lib = await app.context.newPage();
  await lib.goto(`chrome-extension://${app.extensionId}/newtab.html`);

  // Opening a dialog must land focus inside it (the dialog element itself counts), and Escape must close it.
  await lib.getByRole('button', { name: 'Create your first space' }).click();
  const dialog = lib.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const focusInside = await lib.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    return d !== null && (document.activeElement === d || d.contains(document.activeElement));
  });
  expect(focusInside).toBe(true);
  await lib.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Icon-only buttons without an accessible name are invisible to screen readers.
  const anonymous = await lib.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"]')]
      .filter((el) => (el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '') === '')
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  expect(anonymous).toEqual([]);

  // Radio groups follow the ARIA pattern: arrows move and select, only the checked option is tabbable.
  await lib.getByRole('button', { name: 'Settings' }).click();
  await lib.getByRole('radio', { name: 'System' }).first().focus();
  await lib.keyboard.press('ArrowRight');
  const light = lib.getByRole('radio', { name: 'Light' });
  await expect(light).toBeChecked();
  await expect(light).toBeFocused();
  await lib.keyboard.press('ArrowLeft');

  expect(app.workerErrors).toEqual([]);
});
