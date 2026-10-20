import { browser } from 'wxt/browser';
import { db } from '../core/instance';
import { quickSave } from '../core/quicksave';
import { loadSettings } from '../core/settings';

const PAGE = 'tabarium-save-page';
const LINK = 'tabarium-save-link';
const ALL = 'tabarium-save-all';

async function flashBadge(text: string): Promise<void> {
  await browser.action.setBadgeText({ text });
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 2500);
}

async function hasTabsPermission(): Promise<boolean> {
  return browser.permissions.contains({ permissions: ['tabs'] });
}

/** Rebuilds the menu from settings. A no-op until the user has granted `contextMenus`. */
export async function syncContextMenu(): Promise<void> {
  if (!browser.contextMenus) return;
  await browser.contextMenus.removeAll();
  const { contextMenu } = await loadSettings(db);
  if (!contextMenu) return;
  browser.contextMenus.create({ id: PAGE, title: 'Save page to Tabarium', contexts: ['page'] });
  browser.contextMenus.create({ id: LINK, title: 'Save link to Tabarium', contexts: ['link'] });
  if (await hasTabsPermission()) {
    browser.contextMenus.create({ id: ALL, title: 'Save all tabs in this window to Tabarium', contexts: ['page'] });
  }
}

async function handleClick(info: { menuItemId: string | number; linkUrl?: string; selectionText?: string }, tab?: { url?: string; title?: string; favIconUrl?: string; windowId?: number }): Promise<void> {
  if (info.menuItemId === LINK && info.linkUrl) {
    const added = await quickSave(db, [{ title: info.selectionText?.trim() || info.linkUrl, url: info.linkUrl }]);
    await flashBadge(added > 0 ? '+1' : '=');
  } else if (info.menuItemId === PAGE && tab?.url) {
    const added = await quickSave(db, [{ title: tab.title ?? tab.url, url: tab.url, favIconUrl: tab.favIconUrl ?? null }]);
    await flashBadge(added > 0 ? '+1' : '=');
  } else if (info.menuItemId === ALL && tab?.windowId !== undefined) {
    const tabs = await browser.tabs.query({ windowId: tab.windowId });
    const items = tabs
      .filter((t) => t.url && /^https?:\/\//.test(t.url))
      .map((t) => ({ title: t.title ?? (t.url as string), url: t.url as string, favIconUrl: t.favIconUrl ?? null }));
    await flashBadge(`+${await quickSave(db, items)}`);
  }
}

let attached = false;
/** Registers the click handler once `contextMenus` is available (immediately, or after the user grants it). */
export function attachContextMenuHandler(): void {
  if (attached || !browser.contextMenus) return;
  attached = true;
  browser.contextMenus.onClicked.addListener((info, tab) => {
    handleClick(info, tab).catch((e: unknown) => console.error('Tabarium: context menu save failed', e));
  });
}
