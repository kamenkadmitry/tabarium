import type { OpenTab, Platform } from './ports';
import { tr } from '../i18n/runtime';

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
      requestOrigin: async () => true,
      hasAllSites: async () => false,
      requestAllSites: async () => false,
      request: async (c) => {
        granted.add(c);
        return true;
      },
    },
    bookmarks: {
      getTree: async () => [
        {
          id: '0',
          title: '',
          children: [
            { id: '1', title: 'Bookmarks bar', children: DEMO_TABS.map((t) => ({ id: `b${t.id}`, title: t.title, url: t.url })) },
            { id: '2', title: 'Other bookmarks', children: [] },
          ],
        },
      ],
      remove: async () => undefined,
    },
    backupSchedule: { resync: async () => undefined },
    shortcuts: {
      list: async () => [
        { name: 'save-current-tab', description: tr()('cmd.saveTabDesc'), shortcut: 'Ctrl+Shift+S' },
        { name: 'toggle-command-palette', description: tr()('cmd.paletteDesc'), shortcut: 'Ctrl+Shift+K' },
      ],
    },
    tabs: {
      listWindowTabs: async () => [...tabs],
      closeTabs: async (ids) => {
        tabs = tabs.filter((t) => !ids.includes(t.id));
      },
      openUrls: async () => undefined,
      openUrl: async () => undefined,
      listWindows: async () => [
        {
          id: 1,
          current: true,
          tabs: tabs.map((t) => (t.id === 3 || t.id === 4 ? { ...t, groupId: 7 } : t)),
          groups: [{ id: 7, title: 'Frontend docs', color: 'blue' }],
        },
        {
          id: 2,
          current: false,
          groups: [],
          tabs: [
            { id: 11, title: 'Rust by Example', url: 'https://doc.rust-lang.org/rust-by-example/', favIconUrl: null },
            { id: 12, title: 'crates.io', url: 'https://crates.io/', favIconUrl: null },
          ],
        },
      ],
      groupTabs: async () => undefined,
      moveToGroup: async () => undefined,
      ungroupTabs: async () => undefined,
      updateGroup: async () => undefined,
      moveTabs: async () => undefined,
      watchActiveTab: () => () => undefined,
      focusTab: async () => undefined,
      closeWindow: async () => undefined,
      mergeWindows: async () => undefined,
      watch: () => () => undefined,
      replaceWindowTabs: async () => undefined,
      getActiveTab: async () => DEMO_TABS[2] ?? null,
      openLibrary: async () => undefined,
    },
  };
}
