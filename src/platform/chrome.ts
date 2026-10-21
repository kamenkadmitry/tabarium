import { browser } from 'wxt/browser';
import type { BookmarkNode } from '../core/bookmarks';
import type { Capability, OpenOptions, OpenTab, OpenWindow, Platform } from './ports';

function requireExtension(): typeof browser {
  if (!browser?.runtime?.id) {
    throw new Error('Extension APIs are unavailable: this page is not running as a browser extension');
  }
  return browser;
}

// The permission names in `Capability` are a subset of the manifest's optional permissions; the cast narrows
// WXT's wider permission union to ours.
const toPermissions = (capability: Capability) => ({ permissions: [capability] as never[] });

async function openInBackground(urls: readonly string[], options?: OpenOptions): Promise<void> {
  const api = requireExtension();
  const ids: number[] = [];
  for (const url of urls) {
    const tab = await api.tabs.create({ url, active: false });
    if (tab.id !== undefined) ids.push(tab.id);
  }
  if (options?.groupTitle && ids.length > 0) {
    const groupId = await api.tabs.group({ tabIds: ids as [number, ...number[]] });
    await api.tabGroups.update(groupId, { title: options.groupTitle });
  }
}

const isWebUrl = (url: string | undefined): url is string => url !== undefined && /^https?:\/\//.test(url);

function toOpenTab(t: { id?: number; title?: string; url?: string; favIconUrl?: string; groupId?: number; active?: boolean }): OpenTab | null {
  if (t.id === undefined || !isWebUrl(t.url)) return null;
  // Chrome reports -1 for tabs that are not in a group.
  const groupId = t.groupId !== undefined && t.groupId >= 0 ? t.groupId : undefined;
  return { id: t.id, title: t.title ?? t.url, url: t.url, favIconUrl: t.favIconUrl ?? null, active: t.active === true, ...(groupId !== undefined && { groupId }) };
}

function toBookmarkNode(n: { id: string; title: string; url?: string; children?: unknown[] }): BookmarkNode {
  const children = n.children?.map((c) => toBookmarkNode(c as Parameters<typeof toBookmarkNode>[0]));
  return { id: n.id, title: n.title, ...(n.url !== undefined && { url: n.url }), ...(children && { children }) };
}

export function createChromePlatform(): Platform {
  return {
    permissions: {
      has: (capability) => requireExtension().permissions.contains(toPermissions(capability)),
      request: (capability) => requireExtension().permissions.request(toPermissions(capability)),
      requestOrigin: (origin) => requireExtension().permissions.request({ origins: [`${origin}/*`] }),
      hasAllSites: () => requireExtension().permissions.contains({ origins: ['https://*/*', 'http://*/*'] }),
      requestAllSites: () => requireExtension().permissions.request({ origins: ['https://*/*', 'http://*/*'] }),
    },
    bookmarks: {
      async getTree() {
        return (await requireExtension().bookmarks.getTree()).map(toBookmarkNode);
      },
      async remove(ids) {
        const api = requireExtension();
        for (const id of ids) await api.bookmarks.remove(id);
      },
    },
    backupSchedule: {
      async resync() {
        await requireExtension().runtime.sendMessage({ type: 'sync-settings' });
      },
    },
    tabs: {
      async listWindowTabs() {
        const tabs = await requireExtension().tabs.query({ currentWindow: true });
        const result: OpenTab[] = [];
        for (const t of tabs) {
          if (t.id === undefined || !t.url || !/^https?:\/\//.test(t.url)) continue;
          result.push({ id: t.id, title: t.title ?? t.url, url: t.url, favIconUrl: t.favIconUrl ?? null });
        }
        return result;
      },
      async getActiveTab() {
        const [t] = await requireExtension().tabs.query({ active: true, currentWindow: true });
        if (!t || t.id === undefined || !t.url || !/^https?:\/\//.test(t.url)) return null;
        return { id: t.id, title: t.title ?? t.url, url: t.url, favIconUrl: t.favIconUrl ?? null };
      },
      async openLibrary() {
        const api = requireExtension();
        await api.tabs.create({ url: api.runtime.getURL('/newtab.html') });
      },
      async listWindows() {
        const api = requireExtension();
        const [windows, here] = await Promise.all([api.windows.getAll({ populate: true, windowTypes: ['normal'] }), api.windows.getCurrent()]);
        const result: OpenWindow[] = [];
        for (const w of windows) {
          if (w.id === undefined) continue;
          const tabs = (w.tabs ?? []).flatMap((t) => {
            const tab = toOpenTab(t);
            return tab ? [tab] : [];
          });
          // `tabGroups` exists only once the user granted the optional permission.
          const groups = api.tabGroups
            ? (await api.tabGroups.query({ windowId: w.id })).map((g) => ({ id: g.id, title: g.title ?? '', color: g.color }))
            : [];
          result.push({ id: w.id, current: w.id === here.id, tabs, groups });
        }
        // Windows that hold nothing saveable (only the library, settings pages, ...) are not worth showing.
        return result.filter((w) => w.tabs.length > 0 || w.current);
      },
      async groupTabs(tabIds, title, color) {
        const api = requireExtension();
        const tabs = await Promise.all(tabIds.map((id) => api.tabs.get(id)));
        const byWindow = new Map<number, number[]>();
        for (const t of tabs) {
          if (t.id === undefined) continue;
          byWindow.set(t.windowId, [...(byWindow.get(t.windowId) ?? []), t.id]);
        }
        // A browser group lives inside one window, so a selection spanning windows yields one group per window.
        for (const ids of byWindow.values()) {
          const groupId = await api.tabs.group({ tabIds: ids as [number, ...number[]] });
          await api.tabGroups.update(groupId, color === undefined ? { title } : { title, color });
        }
      },
      watchActiveTab(listener) {
        const api = requireExtension();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const fire = () => {
          clearTimeout(timer);
          timer = setTimeout(listener, 100);
        };
        const events = [api.tabs.onActivated, api.tabs.onUpdated, api.windows.onFocusChanged];
        for (const e of events) e.addListener(fire);
        return () => {
          clearTimeout(timer);
          for (const e of events) e.removeListener(fire);
        };
      },
      async focusTab(tabId) {
        const api = requireExtension();
        const tab = await api.tabs.update(tabId, { active: true });
        if (!tab) throw new Error(`Tab ${tabId} no longer exists`);
        if (tab.windowId !== undefined) await api.windows.update(tab.windowId, { focused: true });
      },
      async closeWindow(windowId) {
        await requireExtension().windows.remove(windowId);
      },
      async mergeWindows() {
        const api = requireExtension();
        const here = await api.windows.getCurrent();
        if (here.id === undefined) throw new Error('The current window has no id');
        const others = (await api.windows.getAll({ populate: true, windowTypes: ['normal'] })).filter((w) => w.id !== here.id);
        for (const w of others) {
          const ids = (w.tabs ?? []).flatMap((t) => (t.id === undefined ? [] : [t.id]));
          if (ids.length > 0) await api.tabs.move(ids, { windowId: here.id, index: -1 });
        }
      },
      watch(listener) {
        const api = requireExtension();
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Bursts (restoring a session opens many tabs) are collapsed into one refresh.
        const fire = () => {
          clearTimeout(timer);
          timer = setTimeout(listener, 150);
        };
        const events = [
          api.tabs.onCreated,
          api.tabs.onRemoved,
          api.tabs.onUpdated,
          api.tabs.onMoved,
          api.tabs.onAttached,
          api.tabs.onDetached,
          api.windows.onRemoved,
        ];
        for (const e of events) e.addListener(fire);
        return () => {
          clearTimeout(timer);
          for (const e of events) e.removeListener(fire);
        };
      },
      async closeTabs(ids) {
        await requireExtension().tabs.remove([...ids]);
      },
      async openUrls(urls, options) {
        await openInBackground(urls, options);
      },
      async replaceWindowTabs(urls, options) {
        const api = requireExtension();
        const self = await api.tabs.getCurrent();
        const old = await api.tabs.query({ currentWindow: true });
        await openInBackground(urls, options);
        const closable = old.flatMap((t) => (t.id !== undefined && t.id !== self?.id ? [t.id] : []));
        if (closable.length > 0) await api.tabs.remove(closable);
      },
    },
  };
}
