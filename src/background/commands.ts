import { browser } from 'wxt/browser';
import { db } from '../core/instance';
import { quickSave } from '../core/quicksave';
import { flashBadge } from './badge';

export const SAVE_TAB_COMMAND = 'save-current-tab';
export const PALETTE_COMMAND = 'toggle-command-palette';
export const PALETTE_MESSAGE = 'tabarium-toggle-palette';

/** Saves the focused web tab into the quick-save collection and flashes the result on the toolbar icon. */
export async function saveActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) return;
  const added = await quickSave(db, [{ title: tab.title ?? tab.url, url: tab.url, favIconUrl: tab.favIconUrl ?? null }]);
  await flashBadge(added > 0 ? '+1' : '=');
}

/** Brings the library page forward (or opens it) and tells it to toggle the command palette. */
export async function openCommandPalette(): Promise<void> {
  const libUrl = browser.runtime.getURL('/newtab.html');
  const tabs = await browser.tabs.query({});
  // Own-extension tab URLs are readable without the `tabs` permission; other tabs come back url-less.
  const libs = tabs.filter((t) => t.id !== undefined && t.windowId !== undefined && t.url?.startsWith(libUrl));
  const target = libs.find((t) => t.active) ?? libs[0];
  if (target?.id !== undefined && target.windowId !== undefined) {
    await browser.windows.update(target.windowId, { focused: true });
    await browser.tabs.update(target.id, { active: true });
    await browser.runtime.sendMessage({ type: PALETTE_MESSAGE });
    return;
  }
  // No library page to message: open one with a flag that raises the palette on first render.
  await browser.tabs.create({ url: `${libUrl}?palette` });
}

/** Runs the handler for a manifest command by name. Undefined for commands we do not own. */
export function runCommand(name: string): Promise<void> | undefined {
  if (name === SAVE_TAB_COMMAND) return saveActiveTab();
  if (name === PALETTE_COMMAND) return openCommandPalette();
  return undefined;
}

let attached = false;
/** The commands API needs no permission, so the listener is attached eagerly on every worker start. */
export function attachCommandHandler(): void {
  if (attached || !browser.commands) return;
  attached = true;
  browser.commands.onCommand.addListener((name) => {
    runCommand(name)?.catch((e: unknown) => console.error('Tabarium: command failed', name, e));
  });
}
