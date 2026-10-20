import { browser } from 'wxt/browser';
import type { Capability, OpenOptions, OpenTab, Platform } from './ports';

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

export function createChromePlatform(): Platform {
  return {
    permissions: {
      has: (capability) => requireExtension().permissions.contains(toPermissions(capability)),
      request: (capability) => requireExtension().permissions.request(toPermissions(capability)),
      requestOrigin: (origin) => requireExtension().permissions.request({ origins: [`${origin}/*`] }),
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
