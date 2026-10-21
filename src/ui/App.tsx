import { useLiveQuery } from 'dexie-react-hooks';
import { PanelRightOpen, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type BoardFilter, filterCards, filterCollections, isFiltering, NO_FILTER, sortCollections } from '../core/board';
import type { BoardSort, BoardView } from '../core/boardTypes';
import { db, repo } from '../core/instance';
import { groupTabs, suggestCardDetails } from '../core/ai/tasks';
import { applyCardDetails, applyGroups, loadLabelContext, loadLibraryContext } from '../core/organise';
import { loadSettings, updateSettings } from '../core/settings';
import type { Card, Space } from '../core/types';
import { usePlatform } from '../platform/context';
import { isAiConfigured, withProviderAccess } from './ai';
import { createCollectionActions } from './collectionActions';
import type { OpenTab } from '../platform/ports';
import type { CardRowActions } from './CardRow';
import { BoardToolbar } from './BoardToolbar';
import { CardRow } from './CardRow';
import { AddToCollectionDialog } from './dialogs/AddToCollectionDialog';
import { AiNamesDialog } from './dialogs/AiNamesDialog';
import { AiDetailsDialog, type ProposedDetails } from './dialogs/AiDetailsDialog';
import { CardDialog } from './dialogs/CardDialog';
import { MoveCardDialog } from './dialogs/MoveCardDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveSessionDialog } from './dialogs/SaveSessionDialog';
import { TagsDialog } from './dialogs/TagsDialog';
import { SWATCHES } from './colors';
import { HashtagsPage, TagsPage } from './LabelPages';
import { LabelsProvider, type LabelsApi } from './labels';
import { DuplicatesView, NextView, SearchResults } from './LibraryViews';
import { OpenTabsPanel } from './OpenTabsPanel';
import { filterOpenTabs } from './openTabsModel';
import { SettingsView } from './SettingsView';
import { Sidebar, type View } from './Sidebar';
import { parseDraggedLinks } from './dnd';
import { SpaceBoard } from './SpaceBoard';
import { SpaceHeading } from './SpaceHeading';
import { useLibraryData } from './useLibraryData';
import { useInlineEditor } from './useInlineEditor';
import { useOpenTabsController } from './useOpenTabsController';

type DialogState =
  | { kind: 'space' }
  | { kind: 'rename-space'; space: Space }
  | { kind: 'collection' }
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'card'; card: Card }
  | { kind: 'move'; card: Card }
  | { kind: 'tags'; collectionId?: string }
  | { kind: 'ai-names'; collectionId: string; suggestions: string[] }
  | { kind: 'ai-details'; collectionTitle: string; items: ProposedDetails[]; skipped: number }
  | { kind: 'add-tabs'; tabIds: number[] }
  | { kind: 'session'; tabs: OpenTab[] };

const TITLES = { starred: 'Starred', next: 'Next', duplicates: 'Duplicates', tags: 'Tags', hashtags: 'Hashtags', settings: 'Settings' } as const;

export function App() {
  const platform = usePlatform();
  const data = useLibraryData();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const [selectedView, setView] = useState<View | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  /** Width while (and after) the panel edge is dragged; falls back to the saved width. */
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
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
  const editor = useInlineEditor({ reportError, clearError: () => setError(null) });

  const plainPage = view?.kind === 'settings' || view?.kind === 'tags' || view?.kind === 'hashtags';
  const panelEnabled = settings?.openTabsPanel !== false && !plainPage;
  const tabsCtl = useOpenTabsController({
    enabled: panelEnabled,
    settings,
    spaceId: view?.kind === 'space' ? view.spaceId : undefined,
    run,
  });
  const newCollectionTitle = () => `Saved ${new Date().toLocaleDateString()}`;
  /** Links dragged out of the side panel become a new collection in the given space. */
  const dropLinksAsCollection = (raw: string, targetSpaceId: string) =>
    void run('Adding the dropped links', async () => {
      const links = parseDraggedLinks(raw);
      const col = await repo.createCollection(targetSpaceId, newCollectionTitle());
      await repo.addCards(col.id, links);
    });
  const saveSetting = (what: string, patch: Parameters<typeof updateSettings>[1]) =>
    void run(what, async () => void (await updateSettings(db, patch)));

  if (!data) return null;
  const { spaces, collections, cards, tags, hashtags, nexts, cardsByCollection, cardById, collectionById } = data;

  const activeSpace = view?.kind === 'space' ? spaces.find((s) => s.id === view.spaceId) : undefined;
  const spaceId = activeSpace?.id;
  const q = query.trim().toLowerCase();

  const cardActions = (c: Card): CardRowActions => ({
    onToggleStar: act('Updating tab', () => repo.updateCard(c.id, { starred: !c.starred })),
    onDelete: act('Deleting tab', () => repo.deleteCard(c.id)),
    // On the board the editor opens under the row; lists without a board (Starred, Duplicates, search) use a dialog.
    onEdit: () => (view?.kind === 'space' ? editor.openEdit(c) : setDialog({ kind: 'card', card: c })),
    onMove: () => setDialog({ kind: 'move', card: c }),
    onNext: act('Adding to Next', async () => void (await repo.addToNext(c.id))),
  });

  const aiReady = settings !== undefined && isAiConfigured(settings.ai);

  /** Fills a link's note, tags and hashtags from its title and address. Called straight from a click (permission prompt). */
  const suggestForLink =
    aiReady && settings
      ? (input: { title: string; url: string }) =>
          withProviderAccess(platform, settings.ai, async () => {
            const [details] = await suggestCardDetails(settings.ai, [input], await loadLabelContext(db));
            if (!details) throw new Error('The AI returned nothing for this link.');
            return details;
          })
      : undefined;

  const collectionActions = createCollectionActions({
    platform,
    settings,
    run,
    aiReady,
    cardActions,
    setDialog: (d) => setDialog(d),
    openAddLink: (collectionId) =>
      void run('Opening the editor', async () => {
        const target = collectionById.get(collectionId);
        if (target && !target.expanded) await repo.updateCollection(collectionId, { expanded: true });
        editor.openAdd(collectionId);
      }),
    addTabs: tabsCtl.addTabs,
  });

  const openSaveSession = () =>
    run('Opening Save session', async () => {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read your open tabs.');
      }
      setDialog({ kind: 'session', tabs: await platform.tabs.listWindowTabs() });
    });

  const labelText = (c: Card) =>
    [
      ...c.tagIds.flatMap((id) => tags.find((t) => t.id === id)?.title ?? []),
      ...c.hashtagIds.flatMap((id) => hashtags.find((h) => h.id === id)?.name ?? []).map((n) => `#${n}`),
    ].join(' ');
  const matching = (c: Card) => `${c.title} ${c.customTitle ?? ''} ${c.url} ${c.note ?? ''} ${labelText(c)}`.toLowerCase().includes(q);

  const labelsApi: LabelsApi = {
    tags,
    hashtags,
    tagUsage: new Map(tags.map((t) => [t.id, cards.filter((c) => c.tagIds.includes(t.id)).length])),
    hashtagUsage: new Map(hashtags.map((h) => [h.id, cards.filter((c) => c.hashtagIds.includes(h.id)).length])),
    swatches: SWATCHES.map((sw) => sw.value),
    createTag: async (name, color) => (await repo.createTag(name, color ?? (SWATCHES[tags.length % SWATCHES.length] ?? SWATCHES[0]).value)).id,
    createHashtag: async (name) => (await repo.ensureHashtag(name)).id,
  };
  const tagUsage = new Map(
    tags.map((t) => [t.id, { collections: collections.filter((c) => c.tagIds.includes(t.id)).length, links: cards.filter((c) => c.tagIds.includes(t.id)).length }]),
  );
  const hashtagUsage = new Map(hashtags.map((h) => [h.id, cards.filter((c) => c.hashtagIds.includes(h.id)).length]));
  const searchGroups = collections
    .map((col) => ({
      collection: col,
      space: spaces.find((s) => s.id === col.spaceId),
      cards: (cardsByCollection.get(col.id) ?? []).filter(matching),
    }))
    .filter((g) => g.cards.length > 0);

  const tabCounts = new Map([...cardsByCollection].map(([id, list]) => [id, list.length]));
  const spaceCollections = collections.filter((c) => spaceId !== undefined && c.spaceId === spaceId);
  const visibleCollections = sortCollections(filterCollections(spaceCollections, filter, cardsByCollection), settings?.boardSort ?? 'custom', tabCounts);
  // With a hashtag filter the board shows only the matching links of each collection.
  const boardCards = isFiltering(filter) && filter.hashtagIds.length > 0 ? new Map([...cardsByCollection].map(([id, list]) => [id, filterCards(list, filter)])) : cardsByCollection;
  const spaceHashtags = hashtags
    .map((h) => ({ id: h.id, name: h.name, count: spaceCollections.reduce((n, c) => n + (cardsByCollection.get(c.id) ?? []).filter((card) => card.hashtagIds.includes(h.id)).length, 0) }))
    .filter((h) => h.count > 0);
  const spaceTags = tags.filter((t) => spaceCollections.some((c) => c.tagIds.includes(t.id)));
  const spaceColors = [...new Set(spaceCollections.flatMap((c) => (c.color === null ? [] : [c.color])))];
  const boardView: BoardView = (spaceId !== undefined ? settings?.boardView[spaceId] : undefined) ?? 'grid';
  const spaceTabCount = spaceCollections.reduce((n, c) => n + (tabCounts.get(c.id) ?? 0), 0);

  const nextEntries = nexts.flatMap((item) => {
    const card = cardById.get(item.cardId);
    return card ? [{ item, card }] : [];
  });

  const title = view && view.kind !== 'space' ? TITLES[view.kind] : (activeSpace?.name ?? 'Library');
  const searching = q !== '' && !plainPage;
  const tagsDialogCollection = dialog?.kind === 'tags' && dialog.collectionId ? collectionById.get(dialog.collectionId) : undefined;

  return (
    <LabelsProvider tags={tags} hashtags={hashtags}>
    <div className="flex h-full">
      <Sidebar
        spaces={spaces}
        profile={settings?.profile ?? { name: '', avatar: null }}
        view={view}
        nextCount={nexts.filter((n) => n.state === 'todo').length}
        duplicateCount={data.duplicates.length}
        onSelect={(v) => {
          setView(v);
          setQuery('');
          setFilter(NO_FILTER);
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
        onDropCollection={(id, targetSpaceId) => void run('Moving collection', () => repo.moveCollection(id, targetSpaceId))}
        onDropLinks={dropLinksAsCollection}
        onDropTabs={(tabIds, targetSpaceId) =>
          void tabsCtl.addTabs(tabIds, { kind: 'new', spaceId: targetSpaceId, title: newCollectionTitle() })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          {view?.kind === 'space' && activeSpace ? (
            <SpaceHeading name={activeSpace.name} collections={spaceCollections.length} tabs={spaceTabCount} />
          ) : (
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          )}
          {!plainPage && (
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

          {view?.kind === 'tags' && (
            <TagsPage
              tags={tags}
              usage={tagUsage}
              onCreate={(t, color) => void run('Creating tag', async () => void (await repo.createTag(t, color)))}
              onUpdate={(id, patch) => void run('Updating tag', () => repo.updateTag(id, patch))}
              onDelete={(id) => void run('Deleting tag', () => repo.deleteTag(id))}
              onDeleteUnused={() => void run('Deleting unused tags', async () => void (await repo.deleteUnusedTags()))}
            />
          )}

          {view?.kind === 'hashtags' && (
            <HashtagsPage
              hashtags={hashtags}
              cards={cards}
              usage={hashtagUsage}
              onCreate={(name) => void run('Creating hashtag', async () => void (await repo.ensureHashtag(name)))}
              onRename={(id, name) => void run('Renaming hashtag', () => repo.renameHashtag(id, name))}
              onDelete={(id) => void run('Deleting hashtag', () => repo.deleteHashtag(id))}
              onMerge={(from, into) => void run('Merging hashtags', () => repo.mergeHashtag(from, into))}
              onRemoveFrom={(card, hashtagId) =>
                void run('Removing hashtag', () =>
                  repo.setCardLabels(card.id, { tagIds: card.tagIds, hashtagIds: card.hashtagIds.filter((h) => h !== hashtagId) }),
                )
              }
              onDeleteUnused={() => void run('Deleting unused hashtags', async () => void (await repo.deleteUnusedHashtags()))}
            />
          )}

          {!searching && view?.kind === 'space' && spaceId && (
            <>
              <div className="mb-5">
                <BoardToolbar
                  sort={settings?.boardSort ?? 'custom'}
                  onSort={(boardSort: BoardSort) => saveSetting('Saving the sort order', { boardSort })}
                  view={boardView}
                  onView={(v) => saveSetting('Saving the view', { boardView: { ...(settings?.boardView ?? {}), [spaceId]: v } })}
                  filter={filter}
                  onFilter={setFilter}
                  tags={spaceTags}
                  colors={spaceColors}
                  hashtags={spaceHashtags}
                  onExpandAll={() => void run('Expanding collections', () => repo.setExpandedAll(spaceId, true))}
                  onCollapseAll={() => void run('Collapsing collections', () => repo.setExpandedAll(spaceId, false))}
                  onNewCollection={() => setDialog({ kind: 'collection' })}
                />
              </div>
              <SpaceBoard
                collections={visibleCollections}
                cardsByCollection={boardCards}
                tags={tags}
                view={boardView}
                reorderable={(settings?.boardSort ?? 'custom') === 'custom'}
                filtered={isFiltering(filter)}
                collectionActions={collectionActions}
                editor={editor.slot(labelsApi, boardView === 'list' ? 'columns' : 'stack', suggestForLink)}
                onDropLinksAsCollection={(raw) => dropLinksAsCollection(raw, spaceId)}
                onDropTabsAsCollection={(tabIds) => {
                  void tabsCtl.addTabs(tabIds, { kind: 'new', spaceId, title: newCollectionTitle() });
                }}
              />
            </>
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
          width={liveWidth ?? settings?.openTabsWidth ?? 288}
          onResize={setLiveWidth}
          onResizeEnd={(w) => {
            setLiveWidth(w);
            saveSetting('Saving the panel width', { openTabsWidth: w });
          }}
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
      {dialog?.kind === 'card' && (
        <CardDialog
          card={dialog.card}
          labels={labelsApi}
          suggest={suggestForLink}
          onClose={() => setDialog(null)}
          onSubmit={(values) => editor.saveEdit(dialog.card, values)}
        />
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
      {dialog?.kind === 'ai-details' && (
        <AiDetailsDialog
          collectionTitle={dialog.collectionTitle}
          items={dialog.items}
          skipped={dialog.skipped}
          onClose={() => setDialog(null)}
          onApply={(selected) =>
            run('Applying suggestions', async () => {
              await applyCardDetails(
                db,
                repo,
                selected.map((i) => ({ cardId: i.card.id, ...i.details })),
              );
            })
          }
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
                      undefined,
                      await loadLibraryContext(db, spaceId),
                    );
                    return groups.map((g) => ({
                      title: g.title,
                      tabs: g.indexes.map((i) => tabs[i] as OpenTab),
                      tags: g.tags,
                      hashtags: g.hashtags,
                    }));
                  })
              : undefined
          }
          onSave={({ tabs, collectionId, newTitle, closeTabs, groups }) =>
            run('Saving session', async () => {
              const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });
              if (groups) {
                await applyGroups(
                  db,
                  repo,
                  spaceId,
                  groups.map((g) => ({ title: g.title, cards: g.tabs.map(toCard), tags: g.tags, hashtags: g.hashtags })),
                );
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
    </LabelsProvider>
  );
}
