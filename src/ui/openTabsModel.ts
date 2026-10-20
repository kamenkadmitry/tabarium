import type { OpenTab, OpenWindow, TabGroupInfo } from '../platform/ports';

export interface TabRun {
  /** The browser group of this run, or null for ungrouped tabs. */
  group: TabGroupInfo | null;
  tabs: OpenTab[];
}

/**
 * Splits a window's tabs, in tab-strip order, into runs: consecutive tabs of the same browser group form one
 * run, consecutive ungrouped tabs another. A group the browser did not describe still gets its own run.
 */
export function segmentTabs(window: Pick<OpenWindow, 'tabs' | 'groups'>): TabRun[] {
  const info = new Map(window.groups.map((g) => [g.id, g]));
  const runs: TabRun[] = [];
  let currentId: number | null | undefined;
  for (const tab of window.tabs) {
    const id = tab.groupId ?? null;
    if (runs.length === 0 || id !== currentId) {
      runs.push({ group: id === null ? null : (info.get(id) ?? { id, title: '', color: 'grey' }), tabs: [] });
      currentId = id;
    }
    runs[runs.length - 1]?.tabs.push(tab);
  }
  return runs;
}

/** Open tabs (across all windows) whose title or address contains the query. */
export function filterOpenTabs(windows: readonly OpenWindow[], query: string): OpenTab[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return windows.flatMap((w) => w.tabs).filter((t) => `${t.title} ${t.url}`.toLowerCase().includes(q));
}

/** Browser group colours as CSS colours that stay readable on both themes. */
export const GROUP_COLORS: Record<string, string> = {
  grey: '#6b7280',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#ca8a04',
  green: '#16a34a',
  pink: '#db2777',
  purple: '#9333ea',
  cyan: '#0891b2',
  orange: '#ea580c',
};
