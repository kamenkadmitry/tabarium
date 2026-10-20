import type { OpenTab, Platform } from './ports';

const DEMO_TABS: OpenTab[] = [
  { id: 1, title: 'Hacker News', url: 'https://news.ycombinator.com/', favIconUrl: null },
  { id: 2, title: 'MDN: Intl.DateTimeFormat', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat', favIconUrl: null },
  { id: 3, title: 'Tailwind CSS docs', url: 'https://tailwindcss.com/docs', favIconUrl: null },
  { id: 4, title: 'Vite guide', url: 'https://vite.dev/guide/', favIconUrl: null },
  { id: 5, title: 'Dexie.js liveQuery', url: 'https://dexie.org/docs/liveQuery()', favIconUrl: null },
];

/** In-memory platform for design review outside a real extension (`?demo=1`). Never used in production paths. */
export function createDemoPlatform(): Platform {
  let tabs = [...DEMO_TABS];
  const granted = new Set<string>();
  return {
    permissions: {
      has: async (c) => granted.has(c),
      request: async (c) => {
        granted.add(c);
        return true;
      },
    },
    backupSchedule: { resync: async () => undefined },
    tabs: {
      listWindowTabs: async () => [...tabs],
      closeTabs: async (ids) => {
        tabs = tabs.filter((t) => !ids.includes(t.id));
      },
      openUrls: async () => undefined,
    },
  };
}
