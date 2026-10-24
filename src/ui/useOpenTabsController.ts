import { useMemo, useState } from 'react';
import { groupTabs } from '../core/ai/tasks';
import { db, repo } from '../core/instance';
import { applyGroups, loadLibraryContext } from '../core/organise';
import type { Settings } from '../core/settings';
import { tr } from '../i18n/runtime';
import { usePlatform } from '../platform/context';
import type { OpenTab, OpenWindow, TabGroupColor } from '../platform/ports';
import { withProviderAccess } from './ai';
import type { DuplicateGuard } from './DuplicateGuard';
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
  guard: DuplicateGuard;
}

const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });
const stamp = () => tr().date(new Date());

/** State and actions behind the Open tabs panel: selection, adding tabs to collections, window actions. */
export function useOpenTabsController({ enabled, settings, spaceId, run, guard }: Args) {
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

  /** Wraps a group operation with the `tabGroups` permission request and a panel refresh afterwards. */
  const withGroupAccess = (what: string, action: () => Promise<void>) =>
    void run(what, async () => {
      // `has` first: already-granted drops/blur commits carry no user activation, and only a real prompt needs it.
      if (!(await platform.permissions.has('tabGroups')) && !(await platform.permissions.request('tabGroups'))) {
        throw new Error(tr()('err.needTabGroups'));
      }
      await action();
      await tabs.refresh();
    });

  /** Adds the given open tabs to a collection (existing or new) and, if enabled, closes them. */
  const addTabs = (tabIds: readonly number[], target: TabTarget) =>
    run(tr()('run.addingTabs'), async () => {
      const wanted = tabIds.flatMap((id) => byId.get(id) ?? []);
      if (wanted.length === 0) throw new Error(tr()('err.tabsGone'));
      // Links already in the library are confirmed first; cancelling adds nothing (and creates no collection).
      const chosen = await guard(wanted);
      if (!chosen) return;
      if (chosen.length === 0) return;
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
    focus: (id: number) => void run(tr()('run.switchingTab'), () => platform.tabs.focusTab(id)),
    closeTab: (id: number) => void run(tr()('run.closingTab'), () => platform.tabs.closeTabs([id])),
    closeWindow: (id: number) => void run(tr()('run.closingWindow'), () => platform.tabs.closeWindow(id)),
    merge: () => void run(tr()('run.mergingWindows'), () => platform.tabs.mergeWindows()),
    saveGroup: (groupTabsList: readonly OpenTab[], title: string) =>
      void run(tr()('run.savingGroup'), async () => {
        const target = needSpaceOrThrow(spaceId);
        await addTabs(
          groupTabsList.map((t) => t.id),
          { kind: 'new', spaceId: target, title },
        );
      }),
    /** Turns the selected tabs into a browser tab group (one per window). Needs the `tabGroups` permission. */
    groupSelected: () =>
      void run(tr()('run.groupingTabs'), async () => {
        if (selected.size === 0) throw new Error(tr()('err.selectTabs'));
        if (!(await platform.permissions.request('tabGroups'))) {
          throw new Error(tr()('err.needTabGroupsCreate'));
        }
        await platform.tabs.groupTabs([...selected], tr()('common.groupN', { n: tabs.windows.flatMap((w) => w.groups).length + 1 }));
        setPicked(new Set());
        await tabs.refresh();
      }),
    /** Dissolves a whole browser group: its tabs stay open in place, only the grouping goes away. */
    ungroup: (tabIds: readonly number[]) =>
      withGroupAccess(tr()('run.ungroupingGroup'), () => platform.tabs.ungroupTabs(tabIds)),
    /** Drops on a group column: the tabs join that browser group (moving into its window first when needed). */
    moveToGroup: (tabIds: readonly number[], groupId: number, beforeTabId?: number) =>
      withGroupAccess(tr()('run.movingToGroup'), () => platform.tabs.moveToGroup(tabIds, groupId, beforeTabId)),
    /** Drops on an ungrouped column: grouped tabs come loose first, then land at the position. */
    moveToUngrouped: (tabIds: readonly number[], windowId: number, beforeTabId?: number) =>
      // Reordering loose tabs needs no permission; only ungrouping actually grouped ones does.
      tabIds.some((id) => byId.get(id)?.groupId !== undefined)
        ? withGroupAccess(tr()('run.ungroupingTabs'), async () => {
            await platform.tabs.ungroupTabs(tabIds);
            await platform.tabs.moveTabs(tabIds, windowId, beforeTabId);
          })
        : void run(tr()('run.movingTabs'), async () => {
            await platform.tabs.moveTabs(tabIds, windowId, beforeTabId);
            await tabs.refresh();
          }),
    /** Renames or recolours a browser tab group. */
    updateGroup: (groupId: number, patch: { title?: string; color?: TabGroupColor }) =>
      withGroupAccess(tr()('run.renamingGroup'), () => platform.tabs.updateGroup(groupId, patch)),
    /** Drops on a window's "new group" endcap: the tabs move there and become a new, unnamed group. */
    createGroup: (tabIds: readonly number[], windowId: number) =>
      withGroupAccess(tr()('run.creatingGroup'), async () => {
        await platform.tabs.moveTabs(tabIds, windowId, undefined);
        await platform.tabs.groupTabs(tabIds, '');
      }),
    saveWindow: (w: OpenWindow, name: string) =>
      void run(tr()('run.savingWindow'), async () => {
        const target = needSpaceOrThrow(spaceId);
        await addTabs(
          w.tabs.map((t) => t.id),
          { kind: 'new', spaceId: target, title: w.current ? tr()('common.savedDate', { date: stamp() }) : `${name} ${stamp()}` },
        );
      }),
    organiseWindow: (w: OpenWindow) =>
      void run(tr()('run.organisingAI'), async () => {
        if (!settings) throw new Error(tr()('err.settingsNotLoaded'));
        const target = needSpaceOrThrow(spaceId);
        const groups = await withProviderAccess(platform, settings.ai, async () =>
          groupTabs(
            settings.ai,
            w.tabs.map((t) => ({ title: t.title, url: t.url })),
            undefined,
            await loadLibraryContext(db, target),
          ),
        );
        const approved = await guard(w.tabs);
        if (!approved) return;
        const keep = new Set(approved.map((t) => t.id));
        await applyGroups(
          db,
          repo,
          target,
          groups.map((g) => ({
            title: g.title,
            cards: g.indexes.flatMap((i) => (keep.has((w.tabs[i] as OpenTab).id) ? [toCard(w.tabs[i] as OpenTab)] : [])),
            tags: g.tags,
            hashtags: g.hashtags,
          })),
        );
        if (settings.autoCloseTabs) await platform.tabs.closeTabs(approved.map((t) => t.id));
      }),
  };
}

function needSpaceOrThrow(spaceId: string | undefined): string {
  if (spaceId === undefined) throw new Error(tr()('err.openSpaceFirst'));
  return spaceId;
}
