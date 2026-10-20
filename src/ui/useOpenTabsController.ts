import { useMemo, useState } from 'react';
import { groupTabs } from '../core/ai/tasks';
import { repo } from '../core/instance';
import type { Settings } from '../core/settings';
import { usePlatform } from '../platform/context';
import type { OpenTab, OpenWindow } from '../platform/ports';
import { withProviderAccess } from './ai';
import { useOpenTabs } from './useOpenTabs';

export type Runner = (what: string, action: () => Promise<void>) => Promise<void>;

export type TabTarget =
  | { kind: 'collection'; collectionId: string; before: string | null }
  | { kind: 'new'; spaceId: string; title: string };

interface Args {
  enabled: boolean;
  settings: Settings | undefined;
  /** Space shown in the library; receives collections created from window actions. */
  spaceId: string | undefined;
  run: Runner;
}

const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });
const stamp = () => new Date().toLocaleDateString();

/** State and actions behind the Open tabs panel: selection, adding tabs to collections, window actions. */
export function useOpenTabsController({ enabled, settings, spaceId, run }: Args) {
  const platform = usePlatform();
  const tabs = useOpenTabs(enabled);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());

  const byId = useMemo(() => new Map(tabs.windows.flatMap((w) => w.tabs).map((t) => [t.id, t])), [tabs.windows]);
  // Tabs that were closed since they were picked drop out of the selection by themselves.
  const selected = useMemo(() => new Set([...picked].filter((id) => byId.has(id))), [picked, byId]);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setPicked(new Set());

  /** Adds the given open tabs to a collection (existing or new) and, if enabled, closes them. */
  const addTabs = (tabIds: readonly number[], target: TabTarget) =>
    run('Adding tabs', async () => {
      const chosen = tabIds.flatMap((id) => byId.get(id) ?? []);
      if (chosen.length === 0) throw new Error('Those tabs are no longer open.');
      if (target.kind === 'collection') {
        await repo.addCardsBefore(target.collectionId, chosen.map(toCard), target.before);
      } else {
        const col = await repo.createCollection(target.spaceId, target.title);
        await repo.addCards(col.id, chosen.map(toCard));
      }
      if (settings?.autoCloseTabs) await platform.tabs.closeTabs(chosen.map((t) => t.id));
      setPicked((prev) => new Set([...prev].filter((id) => !chosen.some((t) => t.id === id))));
    });

  return {
    ...tabs,
    selected,
    toggle,
    clear,
    addTabs,
    focus: (id: number) => void run('Switching tab', () => platform.tabs.focusTab(id)),
    closeTab: (id: number) => void run('Closing tab', () => platform.tabs.closeTabs([id])),
    closeWindow: (id: number) => void run('Closing window', () => platform.tabs.closeWindow(id)),
    merge: () => void run('Merging windows', () => platform.tabs.mergeWindows()),
    saveGroup: (groupTabsList: readonly OpenTab[], title: string) =>
      void addTabs(
        groupTabsList.map((t) => t.id),
        { kind: 'new', spaceId: needSpaceOrThrow(spaceId), title },
      ),
    /** Turns the selected tabs into a browser tab group (one per window). Needs the `tabGroups` permission. */
    groupSelected: () =>
      void run('Grouping tabs', async () => {
        if (selected.size === 0) throw new Error('Select some tabs first.');
        if (!(await platform.permissions.request('tabGroups'))) {
          throw new Error('Tabarium needs the "tabGroups" permission to create browser tab groups.');
        }
        await platform.tabs.groupTabs([...selected], `Group ${tabs.windows.flatMap((w) => w.groups).length + 1}`);
        setPicked(new Set());
        await tabs.refresh();
      }),
    saveWindow: (w: OpenWindow, name: string) =>
      void addTabs(
        w.tabs.map((t) => t.id),
        { kind: 'new', spaceId: needSpaceOrThrow(spaceId), title: `${w.current ? 'Saved' : name} ${stamp()}` },
      ),
    organiseWindow: (w: OpenWindow) =>
      void run('Organising with AI', async () => {
        if (!settings) throw new Error('Settings are not loaded yet.');
        const target = needSpaceOrThrow(spaceId);
        const groups = await withProviderAccess(platform, settings.ai, () =>
          groupTabs(
            settings.ai,
            w.tabs.map((t) => ({ title: t.title, url: t.url })),
          ),
        );
        for (const g of groups) {
          const col = await repo.createCollection(target, g.title);
          await repo.addCards(
            col.id,
            g.indexes.map((i) => toCard(w.tabs[i] as OpenTab)),
          );
        }
        if (settings.autoCloseTabs) await platform.tabs.closeTabs(w.tabs.map((t) => t.id));
      }),
  };
}

function needSpaceOrThrow(spaceId: string | undefined): string {
  if (spaceId === undefined) throw new Error('Open a space first: new collections are created in the space you are viewing.');
  return spaceId;
}
