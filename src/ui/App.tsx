import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPlus, PanelRightOpen, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, repo } from '../core/instance';
import { groupTabs, suggestCollectionNames } from '../core/ai/tasks';
import { loadSettings, updateSettings } from '../core/settings';
import type { Card, Collection, Space } from '../core/types';
import { usePlatform } from '../platform/context';
import { isAiConfigured, withProviderAccess } from './ai';
import type { OpenTab } from '../platform/ports';
import type { CardRowActions } from './CardRow';
import { CardRow } from './CardRow';
import type { CollectionActions } from './CollectionCard';
import { AddLinkDialog } from './dialogs/AddLinkDialog';
import { AddToCollectionDialog } from './dialogs/AddToCollectionDialog';
import { AiNamesDialog } from './dialogs/AiNamesDialog';
import { CardDialog } from './dialogs/CardDialog';
import { MoveCardDialog } from './dialogs/MoveCardDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveSessionDialog } from './dialogs/SaveSessionDialog';
import { TagsDialog } from './dialogs/TagsDialog';
import { DuplicatesView, NextView, SearchResults } from './LibraryViews';
import { OpenTabsPanel } from './OpenTabsPanel';
import { filterOpenTabs } from './openTabsModel';
import { SettingsView } from './SettingsView';
import { Sidebar, type View } from './Sidebar';
import { SpaceBoard } from './SpaceBoard';
import { useLibraryData } from './useLibraryData';
import { useOpenTabsController } from './useOpenTabsController';

type DialogState =
  | { kind: 'space' }
  | { kind: 'rename-space'; space: Space }
  | { kind: 'collection' }
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'link'; collectionId: string; title: string }
  | { kind: 'card'; card: Card }
  | { kind: 'move'; card: Card }
  | { kind: 'tags'; collectionId?: string }
  | { kind: 'ai-names'; collectionId: string; suggestions: string[] }
  | { kind: 'add-tabs'; tabIds: number[] }
  | { kind: 'session'; tabs: OpenTab[] };

const TITLES = { starred: 'Starred', next: 'Next', duplicates: 'Duplicates', settings: 'Settings' } as const;

export function App() {
  const platform = usePlatform();
  const data = useLibraryData();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const [selectedView, setView] = useState<View | null>(null);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme === undefined) return;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Until the user picks something, show the first space.
  const firstSpaceId = data?.spaces[0]?.id;
  const view: View | null = selectedView ?? (firstSpaceId ? { kind: 'space', spaceId: firstSpaceId } : null);

  const reportError = (what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
  };
  /** Runs a user-triggered action; failures are logged with context and shown to the user. */
  const run = async (what: string, action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
    } catch (e) {
      reportError(what, e);
    }
  };
  const act = (what: string, action: () => Promise<void>) => () => void run(what, action);

  const panelEnabled = settings?.openTabsPanel !== false && view?.kind !== 'settings';
  const tabsCtl = useOpenTabsController({
    enabled: panelEnabled,
    settings,
    spaceId: view?.kind === 'space' ? view.spaceId : undefined,
    run,
  });
  const newCollectionTitle = () => `Saved ${new Date().toLocaleDateString()}`;
  const saveSetting = (what: string, patch: Parameters<typeof updateSettings>[1]) =>
    void run(what, async () => void (await updateSettings(db, patch)));

  if (!data) return null;
  const { spaces, collections, cards, tags, nexts, cardsByCollection, cardById, collectionById } = data;

  const activeSpace = view?.kind === 'space' ? spaces.find((s) => s.id === view.spaceId) : undefined;
  const spaceId = activeSpace?.id;
  const q = query.trim().toLowerCase();

  const cardActions = (c: Card): CardRowActions => ({
    onToggleStar: act('Updating tab', () => repo.updateCard(c.id, { starred: !c.starred })),
    onDelete: act('Deleting tab', () => repo.deleteCard(c.id)),
    onEdit: () => setDialog({ kind: 'card', card: c }),
    onMove: () => setDialog({ kind: 'move', card: c }),
    onNext: act('Adding to Next', async () => void (await repo.addToNext(c.id))),
  });

  const aiReady = settings !== undefined && isAiConfigured(settings.ai);
  const groupOptions = (col: Collection) => (settings?.tabGroups ? { groupTitle: col.title } : undefined);

  const collectionActions = (col: Collection, list: readonly Card[]): CollectionActions => ({
    addLink: () => setDialog({ kind: 'link', collectionId: col.id, title: col.title }),
    openAll: act('Opening tabs', () =>
      platform.tabs.openUrls(
        list.map((c) => c.url),
        groupOptions(col),
      ),
    ),
    suggestName:
      aiReady && settings
        ? () =>
            void run('Suggesting names', async () => {
              const suggestions = await withProviderAccess(platform, settings.ai, () =>
                suggestCollectionNames(
                  settings.ai,
                  list.map((c) => ({ title: c.customTitle ?? c.title, url: c.url })),
                ),
              );
              setDialog({ kind: 'ai-names', collectionId: col.id, suggestions });
            })
        : undefined,
    replaceWindow: () => {
      if (!confirm(`Close the other tabs in this window and open “${col.title}” instead?`)) return;
      void run('Replacing window tabs', async () => {
        if (!(await platform.permissions.request('tabs'))) {
          throw new Error('Tabarium needs the "tabs" permission to replace the tabs of this window.');
        }
        await platform.tabs.replaceWindowTabs(
          list.map((c) => c.url),
          groupOptions(col),
        );
      });
    },
    rename: () => setDialog({ kind: 'rename-collection', id: col.id, title: col.title }),
    remove: () => {
      if (confirm(`Delete “${col.title}” and its ${list.length} tabs?`)) {
        void run('Deleting collection', () => repo.deleteCollection(col.id));
      }
    },
    editTags: () => setDialog({ kind: 'tags', collectionId: col.id }),
    setColor: (color) => void run('Setting colour', () => repo.updateCollection(col.id, { color })),
    addAllToNext: act('Adding to Next', async () => {
      for (const c of list) await repo.addToNext(c.id);
    }),
    card: cardActions,
    dropCard: (cardId, before) => void run('Moving tab', () => repo.moveCard(cardId, col.id, before)),
    dropTabs: (tabIds, before) => void tabsCtl.addTabs(tabIds, { kind: 'collection', collectionId: col.id, before }),
    dropCollection: (id) => void run('Moving collection', () => repo.moveCollection(id, col.spaceId, col.id)),
  });

  const openSaveSession = () =>
    run('Opening Save session', async () => {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read your open tabs.');
      }
      setDialog({ kind: 'session', tabs: await platform.tabs.listWindowTabs() });
    });

  const matching = (c: Card) => `${c.title} ${c.customTitle ?? ''} ${c.url} ${c.note ?? ''}`.toLowerCase().includes(q);
  const searchGroups = collections
    .map((col) => ({
      collection: col,
      space: spaces.find((s) => s.id === col.spaceId),
      cards: (cardsByCollection.get(col.id) ?? []).filter(matching),
    }))
    .filter((g) => g.cards.length > 0);

  const visibleCollections = collections
    .filter((c) => spaceId !== undefined && c.spaceId === spaceId)
    .filter((c) => tagFilter === null || c.tagIds.includes(tagFilter));
  const spaceTags = tags.filter((t) => collections.some((c) => c.spaceId === spaceId && c.tagIds.includes(t.id)));

  const nextEntries = nexts.flatMap((item) => {
    const card = cardById.get(item.cardId);
    return card ? [{ item, card }] : [];
  });

  const title = view && view.kind !== 'space' ? TITLES[view.kind] : (activeSpace?.name ?? 'Library');
  const searching = q !== '' && view?.kind !== 'settings';
  const tagsDialogCollection = dialog?.kind === 'tags' && dialog.collectionId ? collectionById.get(dialog.collectionId) : undefined;

  return (
    <div className="flex h-full">
      <Sidebar
        spaces={spaces}
        view={view}
        nextCount={nexts.filter((n) => n.state === 'todo').length}
        duplicateCount={data.duplicates.length}
        onSelect={(v) => {
          setView(v);
          setQuery('');
          setTagFilter(null);
        }}
        onCreateSpace={() => setDialog({ kind: 'space' })}
        onRenameSpace={(space) => setDialog({ kind: 'rename-space', space })}
        onDeleteSpace={(space) => {
          const n = collections.filter((c) => c.spaceId === space.id).length;
          if (confirm(`Delete the space “${space.name}” with its ${n} collections and all their tabs?`)) {
            void run('Deleting space', async () => {
              await repo.deleteSpace(space.id);
              if (view?.kind === 'space' && view.spaceId === space.id) setView(null);
            });
          }
        }}
        onManageTags={() => setDialog({ kind: 'tags' })}
        onDropCollection={(id, targetSpaceId) => void run('Moving collection', () => repo.moveCollection(id, targetSpaceId))}
        onDropTabs={(tabIds, targetSpaceId) =>
          void tabsCtl.addTabs(tabIds, { kind: 'new', spaceId: targetSpaceId, title: newCollectionTitle() })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {view?.kind !== 'settings' && (
            <label className="relative ml-4 max-w-md flex-1">
              <span className="sr-only">Search all tabs</span>
              <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all tabs, notes and links"
                className="h-10 w-full rounded-lg border border-line bg-bg pl-9 pr-3 text-sm placeholder:text-muted"
              />
            </label>
          )}
          {view?.kind === 'space' && (
            <div className="ml-auto flex items-center gap-2">
              {settings?.openTabsPanel === false && (
                <button
                  type="button"
                  aria-label="Show open tabs"
                  onClick={() => saveSetting('Showing open tabs', { openTabsPanel: true })}
                  className="grid size-10 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                >
                  <PanelRightOpen size={17} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => setDialog({ kind: 'collection' })}
                className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2"
              >
                <FolderPlus size={16} aria-hidden /> New collection
              </button>
              <button
                type="button"
                onClick={() => void openSaveSession()}
                className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90"
              >
                <Plus size={16} aria-hidden /> Save session
              </button>
            </div>
          )}
        </header>

        {error && (
          <div role="alert" className="flex items-center gap-3 border-b border-line bg-surface-2 px-6 py-2 text-sm text-danger">
            <span className="flex-1">{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {searching && (
            <SearchResults
              groups={searchGroups}
              query={query.trim()}
              cardActions={cardActions}
              openTabs={filterOpenTabs(tabsCtl.windows, query)}
              onFocusTab={tabsCtl.focus}
              onAddOpenTab={(tabId) => setDialog({ kind: 'add-tabs', tabIds: [tabId] })}
            />
          )}

          {!searching && view?.kind === 'starred' && (
            <ul className="max-w-xl rounded-2xl border border-line bg-surface p-2">
              {cards
                .filter((c) => c.starred)
                .map((c) => (
                  <CardRow key={c.id} card={c} draggable={false} {...cardActions(c)} />
                ))}
              {!cards.some((c) => c.starred) && <li className="p-6 text-center text-sm text-muted">Star a tab to find it here.</li>}
            </ul>
          )}

          {!searching && view?.kind === 'next' && (
            <NextView
              entries={nextEntries}
              onToggle={(item) => void run('Updating Next', () => repo.setNextState(item.id, item.state === 'done' ? 'todo' : 'done'))}
              onRemove={(item) => void run('Updating Next', () => repo.removeFromNext(item.id))}
              onMove={(id, before) => void run('Reordering Next', () => repo.moveNext(id, before))}
            />
          )}

          {!searching && view?.kind === 'duplicates' && (
            <DuplicatesView
              groups={data.duplicates.map((g) => ({ ...g, collections: collectionById }))}
              cardActions={cardActions}
            />
          )}

          {view?.kind === 'settings' && <SettingsView onError={reportError} />}

          {!searching && view?.kind === 'space' && (
            <SpaceBoard
              collections={visibleCollections}
              cardsByCollection={cardsByCollection}
              tags={tags}
              spaceTags={spaceTags}
              tagFilter={tagFilter}
              onTagFilter={setTagFilter}
              collectionActions={collectionActions}
              onDropTabsAsCollection={(tabIds) => {
                if (spaceId) void tabsCtl.addTabs(tabIds, { kind: 'new', spaceId, title: newCollectionTitle() });
              }}
            />
          )}

          {view === null && (
            <div className="mx-auto mt-24 max-w-sm text-center">
              <h2 className="text-lg font-bold">Welcome to Tabarium</h2>
              <p className="mt-2 text-muted">Everything stays in your browser. Start by creating a space for your collections.</p>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'space' })}
                className="mt-5 h-11 rounded-lg bg-primary px-5 text-sm font-bold text-primary-fg hover:opacity-90"
              >
                Create your first space
              </button>
            </div>
          )}
        </div>
      </main>

      {panelEnabled && settings?.openTabsPanel !== false && (
        <OpenTabsPanel
          access={tabsCtl.access}
          windows={tabsCtl.windows}
          error={tabsCtl.error}
          selected={tabsCtl.selected}
          autoClose={settings?.autoCloseTabs ?? false}
          aiReady={aiReady}
          onGrant={() => void tabsCtl.grant()}
          onHide={() => saveSetting('Hiding open tabs', { openTabsPanel: false })}
          onMerge={tabsCtl.merge}
          onFocus={tabsCtl.focus}
          onCloseTab={tabsCtl.closeTab}
          onCloseWindow={tabsCtl.closeWindow}
          onToggle={tabsCtl.toggle}
          onSaveWindow={tabsCtl.saveWindow}
          onSaveGroup={tabsCtl.saveGroup}
          onGroupSelected={tabsCtl.groupSelected}
          onOrganiseWindow={tabsCtl.organiseWindow}
          onAddSelected={() => setDialog({ kind: 'add-tabs', tabIds: [...tabsCtl.selected] })}
          onClearSelection={tabsCtl.clear}
          onAutoClose={(v) => saveSetting('Saving setting', { autoCloseTabs: v })}
        />
      )}

      {dialog?.kind === 'space' && (
        <PromptDialog
          title="Create space"
          label="Space name"
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(name) =>
            run('Creating space', async () => {
              const space = await repo.createSpace(name);
              setView({ kind: 'space', spaceId: space.id });
            })
          }
        />
      )}
      {dialog?.kind === 'rename-space' && (
        <PromptDialog
          title="Rename space"
          label="Space name"
          submitLabel="Save"
          initialValue={dialog.space.name}
          onClose={() => setDialog(null)}
          onSubmit={(name) => run('Renaming space', () => repo.renameSpace(dialog.space.id, name))}
        />
      )}
      {dialog?.kind === 'collection' && spaceId && (
        <PromptDialog
          title="New collection"
          label="Collection name"
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(t) => run('Creating collection', async () => void (await repo.createCollection(spaceId, t)))}
        />
      )}
      {dialog?.kind === 'rename-collection' && (
        <PromptDialog
          title="Rename collection"
          label="Collection name"
          submitLabel="Save"
          initialValue={dialog.title}
          onClose={() => setDialog(null)}
          onSubmit={(t) => run('Renaming collection', () => repo.updateCollection(dialog.id, { title: t }))}
        />
      )}
      {dialog?.kind === 'link' && (
        <AddLinkDialog
          collectionTitle={dialog.title}
          onClose={() => setDialog(null)}
          onSubmit={(link) => run('Adding link', async () => void (await repo.addCards(dialog.collectionId, [link])))}
        />
      )}
      {dialog?.kind === 'card' && (
        <CardDialog card={dialog.card} onClose={() => setDialog(null)} onSubmit={(patch) => run('Saving tab', () => repo.updateCard(dialog.card.id, patch))} />
      )}
      {dialog?.kind === 'move' && (
        <MoveCardDialog
          spaces={spaces}
          collections={collections}
          currentCollectionId={dialog.card.collectionId}
          onClose={() => setDialog(null)}
          onSubmit={(target) => run('Moving tab', () => repo.moveCard(dialog.card.id, target))}
        />
      )}
      {dialog?.kind === 'add-tabs' && (
        <AddToCollectionDialog
          count={dialog.tabIds.length}
          spaces={spaces}
          collections={collections}
          newCollectionSpaceId={spaceId}
          onClose={() => setDialog(null)}
          onSubmit={(target) =>
            tabsCtl.addTabs(
              dialog.tabIds,
              'collectionId' in target
                ? { kind: 'collection', collectionId: target.collectionId, before: null }
                : { kind: 'new', spaceId: spaceId as string, title: target.newTitle },
            )
          }
        />
      )}
      {dialog?.kind === 'ai-names' && (
        <AiNamesDialog
          suggestions={dialog.suggestions}
          onClose={() => setDialog(null)}
          onPick={(title) => run('Renaming collection', () => repo.updateCollection(dialog.collectionId, { title }))}
        />
      )}
      {dialog?.kind === 'tags' && (
        <TagsDialog
          tags={tags}
          collection={tagsDialogCollection}
          onClose={() => setDialog(null)}
          onCreate={(t, color) => run('Creating tag', async () => void (await repo.createTag(t, color)))}
          onDelete={(id) => run('Deleting tag', () => repo.deleteTag(id))}
          onAssign={(id, tagIds) => run('Updating tags', () => repo.setCollectionTags(id, tagIds))}
        />
      )}
      {dialog?.kind === 'session' && spaceId && (
        <SaveSessionDialog
          tabs={dialog.tabs}
          collections={collections.filter((c) => c.spaceId === spaceId)}
          onClose={() => setDialog(null)}
          onOrganise={
            aiReady && settings
              ? (tabs) =>
                  withProviderAccess(platform, settings.ai, async () => {
                    const groups = await groupTabs(
                      settings.ai,
                      tabs.map((t) => ({ title: t.title, url: t.url })),
                    );
                    return groups.map((g) => ({ title: g.title, tabs: g.indexes.map((i) => tabs[i] as OpenTab) }));
                  })
              : undefined
          }
          onSave={({ tabs, collectionId, newTitle, closeTabs, groups }) =>
            run('Saving session', async () => {
              const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });
              if (groups) {
                for (const g of groups) {
                  const col = await repo.createCollection(spaceId, g.title);
                  await repo.addCards(col.id, g.tabs.map(toCard));
                }
              } else {
                const targetId = collectionId ?? (await repo.createCollection(spaceId, newTitle)).id;
                await repo.addCards(targetId, tabs.map(toCard));
              }
              if (closeTabs) await platform.tabs.closeTabs(tabs.map((t) => t.id));
            })
          }
        />
      )}
    </div>
  );
}
