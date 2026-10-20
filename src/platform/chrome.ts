import { browser } from 'wxt/browser';
import type { Capability, OpenTab, Platform } from './ports';

function requireExtension(): typeof browser {
  if (!browser?.runtime?.id) {
    throw new Error('Extension APIs are unavailable: this page is not running as a browser extension');
  }
  return browser;
}

// The permission names in `Capability` are a subset of the manifest's optional permissions; the cast narrows
// WXT's wider permission union to ours.
const toPermissions = (capability: Capability) => ({ permissions: [capability] as never[] });

export function createChromePlatform(): Platform {
  return {
    permissions: {
      has: (capability) => requireExtension().permissions.contains(toPermissions(capability)),
      request: (capability) => requireExtension().permissions.request(toPermissions(capability)),
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
      async closeTabs(ids) {
        await requireExtension().tabs.remove([...ids]);
      },
      async openUrls(urls) {
        const api = requireExtension();
        for (const url of urls) await api.tabs.create({ url, active: false });
      },
    },
  };
}
