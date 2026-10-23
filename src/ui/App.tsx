import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, PanelRightOpen, Plus, Search, Star, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type BoardFilter, filterCards, filterCollections, isFiltering, NO_FILTER, sortCollections } from '../core/board';
import type { BoardSort, BoardView } from '../core/boardTypes';
import { db, repo } from '../core/instance';
import { groupTabs, suggestCardDetails } from '../core/ai/tasks';
import type { InboxGroup, InboxSort } from '../core/inbox';
import { applyCardDetails, applyGroups, loadLabelContext, loadLibraryContext } from '../core/organise';
import { ensureInbox, inboxCards, inboxSpace, moveToInbox } from '../core/quicksave';
import { loadSettings, updateSettings } from '../core/settings';
import { cardSearchText } from './searchModel';
import type { Card, Space } from '../core/types';
import type { Deletion } from '../core/undo';
import { usePlatform } from '../platform/context';
import { isAiConfigured, withProviderAccess } from './ai';
import { createCollectionActions } from './collectionActions';
import type { OpenTab } from '../platform/ports';
import type { CardRowActions } from './CardRow';
import { BoardToolbar } from './BoardToolbar';
import { BulkBar } from './BulkBar';
import { CardRow } from './CardRow';
import { CommandPalette } from './CommandPalette';
import { AddToCollectionDialog } from './dialogs/AddToCollectionDialog';
import { AiNamesDialog } from './dialogs/AiNamesDialog';
import { AiDetailsDialog, type ProposedDetails } from './dialogs/AiDetailsDialog';
import { BulkLabelsDialog } from './dialogs/BulkLabelsDialog';
import { CardDialog } from './dialogs/CardDialog';
import { MoveCardDialog } from './dialogs/MoveCardDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveSessionDialog } from './dialogs/SaveSessionDialog';
import { SpaceDialog } from './dialogs/SpaceDialog';
import { TagsDialog } from './dialogs/TagsDialog';
import { UndoToast } from './UndoToast';
import { HashtagsPage, TagsPage } from './LabelPages';
import { EmptyState } from './EmptyState';
import { LabelsProvider } from './labels';
import { DuplicatesView, SearchResults } from './LibraryViews';
import { OpenTabsPanel } from './OpenTabsPanel';
import { filterOpenTabs } from './openTabsModel';
import { SettingsView } from './SettingsView';
import { Sidebar, type View } from './Sidebar';
import { parseDraggedLinks } from './dnd';
import { SpaceBoard } from './SpaceBoard';
import { SpaceHeading } from './SpaceHeading';
import { TabOrganizer } from './TabOrganizer';
import { useLibraryData } from './useLibraryData';
import { useDuplicateGuard } from './DuplicateGuard';
import { buildLabelsApi } from './labelsApi';
import { BookmarksPage } from './BookmarksPage';
import { DashboardPage } from './DashboardPage';
import { InboxPage } from './InboxPage';
import { SWATCHES } from './colors';
import { proposeDetails } from './suggestDetails';
import { useInboxReading } from './useInboxReading';
import { useCardSelection } from './useCardSelection';
import { useInlineEditor } from './useInlineEditor';
import { useOpenTabsController } from './useOpenTabsController';

type DialogState =
  | { kind: 'space' }
  | { kind: 'rename-space'; space: Space }
  | { kind: 'collection' }
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'card'; card: Card }
  | { kind: 'move'; card: Card }
  | { kind: 'move-many'; ids: string[] }
  | { kind: 'bulk-labels'; ids: string[] }
  | { kind: 'tags'; collectionId?: string }
  | { kind: 'ai-names'; collectionId: string; suggestions: string[] }
  | { kind: 'ai-details'; title: string; items: ProposedDetails[]; skipped: number }
  | { kind: 'add-tabs'; tabIds: number[] }
  | { kind: 'session'; tabs: OpenTab[] };

const TITLES = { dashboard: 'Dashboard', starred: 'Starred', duplicates: 'Duplicates', bookmarks: 'Browser bookmarks', tags: 'Tags', hashtags: 'Hashtags', settings: 'Settings', organizer: 'Tab organizer' } as const;

/** One entry in the tab's history stack; pos orders entries so the chevrons know where the edges are. */
interface NavEntry {
  pos: number;
  view: View | null;
}

const sameView = (a: View | null, b: View | null): boolean =>
  a === b || (a?.kind === b?.kind && (a?.kind !== 'space' || (b?.kind === 'space' && a.spaceId === b.spaceId)));

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
  // `newtab.html?palette` is how the manifest Ctrl+K command opens the palette on a fresh page.
  const [paletteOpen, setPaletteOpen] = useState(() => new URLSearchParams(location.search).has('palette'));
  const [error, setError] = useState<string | null>(null);
  /** The last delete's snapshot, held while the undo toast is up. A new delete replaces (and finalizes) it. */
  const [undo, setUndo] = useState<Deletion | null>(null);
  /** Offers undo for a delete that actually removed rows; a delete that matched nothing shows no toast. */
  const undoable = (d: Deletion) => {
    const empty =
      (d.kind === 'cards' && d.cards.length === 0) ||
      (d.kind === 'tags' && d.tags.length === 0) ||
      (d.kind === 'hashtags' && d.hashtags.length === 0);
    setUndo(empty ? null : d);
  };

  const theme = settings?.theme;
  const palette = settings?.palette;
  useEffect(() => {
    if (theme === undefined || palette === undefined) return;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.palette = palette;
  }, [theme, palette]);

  // Until the user picks something, show the first space.
  // The Inbox is always there; the welcome screen is for the first space of your own.
  const firstSpaceId = data?.spaces.find((s) => s.kind !== 'inbox')?.id;
  const requested: View | null = selectedView ?? (firstSpaceId ? { kind: 'space', spaceId: firstSpaceId } : null);
  // A view naming a space that no longer exists (e.g. a history entry to a deleted space) falls back to default.
  const view: View | null =
    requested?.kind === 'space' && data && !data.spaces.some((s) => s.id === requested.spaceId)
      ? (firstSpaceId ? { kind: 'space', spaceId: firstSpaceId } : null)
      : requested;
  const organizerOpen = view?.kind === 'organizer';

  const reportError = useCallback((what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
  }, []);
  /** Runs a user-triggered action; failures are logged with context and shown to the user. */
  const run = useCallback(
    async (what: string, action: () => Promise<void>) => {
      try {
        setError(null);
        await action();
      } catch (e) {
        reportError(what, e);
      }
    },
    [reportError],
  );
  const act = (what: string, action: () => Promise<void>) => () => void run(what, action);
  const guard = useDuplicateGuard();
  const editor = useInlineEditor({ reportError, clearError: () => setError(null), guard });
  // Creates the Inbox on first use and adopts an older one, so it exists before anything is saved to it.
  useEffect(() => {
    ensureInbox(db).catch((e: unknown) => reportError('Preparing the Inbox', e));
  }, [reportError]);
  const picked = useCardSelection();
  const inboxCardList = inboxCards(data?.spaces ?? [], data?.collections ?? [], data?.cards ?? []);
  const inboxViewActive = view?.kind === 'space' && data?.spaces.find((sp) => sp.id === view.spaceId)?.kind === 'inbox';
  const reading = useInboxReading({ enabled: settings?.fetchDescriptions === true, active: inboxViewActive, cards: inboxCardList, reportError });
  const clearPicked = picked.clear;

  /** Applies a view with the resets a navigation always carries: selection, search and board filter. */
  const applyView = (v: View | null) => {
    setView(v);
    clearPicked();
    setQuery('');
    setFilter(NO_FILTER);
  };
  /** pos is where the cursor sits in our history slice; seq is its forward edge (the highest pos written). */
  const [nav, setNav] = useState(() => {
    const entry = history.state as NavEntry | null;
    const pos = entry && typeof entry.pos === 'number' ? entry.pos : 0;
    return { pos, seq: pos };
  });
  /** Latest applyView for the popstate listener bound once below; a stale space falls back where `view` is derived. */
  const popRef = useRef<(v: View | null) => void>(() => {});
  useEffect(() => {
    popRef.current = applyView;
  });
  /** Moves to a view and records it in the tab's history unless it is where we already are. */
  const navigate = (v: View | null) => {
    if (!sameView(v, view)) {
      const pos = nav.seq + 1;
      history.pushState({ pos, view: v } satisfies NavEntry, '');
      setNav({ pos, seq: pos });
    }
    applyView(v);
  };
  useEffect(() => {
    if (!(history.state as NavEntry | null)) history.replaceState({ pos: 0, view: null } satisfies NavEntry, '');
    const onPop = (e: PopStateEvent) => {
      const st = e.state as NavEntry | null;
      if (st && typeof st.pos === 'number' && 'view' in st) {
        setNav((s) => ({ pos: st.pos, seq: Math.max(s.seq, st.pos) }));
        popRef.current(st.view ?? null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Esc drops the selection, unless it is used by something that is open (a field, the editor, a dialog).
  const hasPicked = picked.selected.size > 0;
  useEffect(() => {
    if (!hasPicked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, form, dialog, [role=menu]')) return;
      clearPicked();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasPicked, clearPicked]);

  // Esc leaves the tab organizer the same way the Back button does. Text-entry controls keep Esc for
  // themselves (the rename input cancels with it); checkboxes and buttons don't swallow it.
  const leavingOrganizer = useRef(false);
  useEffect(() => {
    if (!organizerOpen) {
      leavingOrganizer.current = false;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      // One pop per press, and never again once leaving: popstate is async, a second Escape must not overshoot.
      if (e.key !== 'Escape' || e.defaultPrevented || leavingOrganizer.current) return;
      const el = e.target as HTMLElement;
      if (el.closest('input:not([type=checkbox]):not([type=radio]), textarea, select, form, dialog, [role=menu]')) return;
      // An open menu or dialog consumes Escape itself.
      if (document.querySelector('[role=menu], dialog[open]')) return;
      leavingOrganizer.current = true;
      history.back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [organizerOpen]);

  // Ctrl/Cmd+K toggles the command palette from anywhere — including inside inputs and on views
  // where the header search isn't rendered. A different open dialog keeps the shortcut for itself.
  // The custom event is the same toggle relayed from the manifest command by the service worker —
  // Chrome reserves Ctrl+K for the omnibox before any page listener can see it.
  useEffect(() => {
    const toggle = () => setPaletteOpen((open) => !open);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
      if (document.querySelector('dialog[open]:not([data-command-palette])')) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('tabarium:toggle-palette', toggle);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('tabarium:toggle-palette', toggle);
    };
  }, []);

  const plainPage =
    organizerOpen || view?.kind === 'dashboard' || view?.kind === 'bookmarks' || view?.kind === 'settings' || view?.kind === 'tags' || view?.kind === 'hashtags';
  const panelEnabled = settings?.openTabsPanel !== false && !plainPage;
  const tabsCtl = useOpenTabsController({
    enabled: panelEnabled || organizerOpen,
    settings,
    spaceId: view?.kind === 'space' ? view.spaceId : organizerOpen ? firstSpaceId : undefined,
    run,
    guard,
  });
  const newCollectionTitle = () => `Saved ${new Date().toLocaleDateString()}`;
  /** Links dragged out of the side panel become a new collection in the given space. */
  const dropLinksAsCollection = (raw: string, targetSpaceId: string) =>
    void run('Adding the dropped links', async () => {
      const links = await guard(parseDraggedLinks(raw));
      if (!links || links.length === 0) return;
      const col = await repo.createCollection(targetSpaceId, newCollectionTitle());
      await repo.addCards(col.id, links);
    });
  const saveSetting = (what: string, patch: Parameters<typeof updateSettings>[1]) =>
    void run(what, async () => void (await updateSettings(db, patch)));

  if (!data) return null;
  const { spaces, collections, cards, tags, hashtags, cardsByCollection, cardById, collectionById } = data;

  const activeSpace = view?.kind === 'space' ? spaces.find((s) => s.id === view.spaceId) : undefined;
  const spaceId = activeSpace?.id;
  const q = query.trim().toLowerCase();

  const inboxSpaceId = inboxSpace(spaces)?.id;
  const inboxCollectionIds = new Set(collections.filter((c) => c.spaceId === inboxSpaceId).map((c) => c.id));
  const inboxCollections = collections.filter((c) => inboxCollectionIds.has(c.id));
  // Where links added on the Inbox page land: the "Saved tabs" collection, or the first one the Inbox has.
  const inboxDefault = inboxCollections.find((c) => c.title === 'Saved tabs') ?? inboxCollections[0];

  const cardActions = (c: Card): CardRowActions => ({
    onToggleStar: act('Updating tab', () => repo.updateCard(c.id, { starred: !c.starred })),
    onDelete: act('Deleting tab', async () => undoable(await repo.deleteCard(c.id, view?.kind === 'duplicates' ? 'duplicate' : undefined))),
    // On the board the editor opens under the row; lists without a board (Starred, Duplicates, search) use a dialog.
    onEdit: () => (view?.kind === 'space' ? editor.openEdit(c) : setDialog({ kind: 'card', card: c })),
    onMove: () => setDialog({ kind: 'move', card: c }),
    onInbox: inboxCollectionIds.has(c.collectionId) ? undefined : act('Moving to Inbox', () => moveToInbox(db, [c.id])),
    // Label chips filter only where a board toolbar exists; elsewhere they stay plain text.
    onFilterLabel:
      view?.kind === 'space' && !inboxViewActive && q === ''
        ? (kind, id) =>
            setFilter((f) => {
              const toggle = (list: readonly string[]) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
              return kind === 'hashtag' ? { ...f, hashtagIds: toggle(f.hashtagIds) } : { ...f, cardTagIds: toggle(f.cardTagIds) };
            })
        : undefined,
  });

  const aiReady = settings !== undefined && isAiConfigured(settings.ai);

  // Links ticked on the board; ids of links that no longer exist drop out by themselves.
  const pickedIds = [...picked.selected].filter((id) => cardById.has(id));
  const selection = { ...picked, selected: new Set(pickedIds) as ReadonlySet<string> };
  const pickedCards = pickedIds.flatMap((id) => cardById.get(id) ?? []);
  const bulk = (what: string, action: () => Promise<void>) => void run(what, action).then(clearPicked);

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
    guard,
    onDeleted: undoable,
  });

  const openSaveSession = () =>
    run('Opening Save session', async () => {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read your open tabs.');
      }
      setDialog({ kind: 'session', tabs: await platform.tabs.listWindowTabs() });
    });

  const matching = (c: Card) => cardSearchText(c, tags, hashtags).includes(q);

  const labelsApi = buildLabelsApi(tags, hashtags, cards);
  const inboxSlot = editor.slot(labelsApi, 'stack', suggestForLink);
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
  // With a hashtag or link-tag filter the board shows only the matching links of each collection.
  const boardCards =
    isFiltering(filter) && (filter.hashtagIds.length > 0 || filter.cardTagIds.length > 0)
      ? new Map([...cardsByCollection].map(([id, list]) => [id, filterCards(list, filter)]))
      : cardsByCollection;
  const spaceHashtags = hashtags
    .map((h) => ({ id: h.id, name: h.name, count: spaceCollections.reduce((n, c) => n + (cardsByCollection.get(c.id) ?? []).filter((card) => card.hashtagIds.includes(h.id)).length, 0) }))
    .filter((h) => h.count > 0);
  const spaceTags = tags.filter((t) => spaceCollections.some((c) => c.tagIds.includes(t.id)));
  const spaceColors = [...new Set(spaceCollections.flatMap((c) => (c.color === null ? [] : [c.color])))];
  const boardView: BoardView = (spaceId !== undefined ? settings?.boardView[spaceId] : undefined) ?? 'grid';
  const spaceTabCount = spaceCollections.reduce((n, c) => n + (tabCounts.get(c.id) ?? 0), 0);


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
        inboxCount={inboxCards(spaces, collections, cards).length}
        duplicateCount={data.duplicates.length}
        onSelect={navigate}
        onCreateSpace={() => setDialog({ kind: 'space' })}
        onRenameSpace={(space) => setDialog({ kind: 'rename-space', space })}
        onDeleteSpace={(space) => {
          const n = collections.filter((c) => c.spaceId === space.id).length;
          if (confirm(`Delete the space “${space.name}” with its ${n} collections and all their tabs?`)) {
            void run('Deleting space', async () => {
              undoable(await repo.deleteSpace(space.id));
              if (view?.kind === 'space' && view.spaceId === space.id) navigate(null);
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
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Go back"
              disabled={nav.pos <= 0}
              onClick={() => history.back()}
              className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 enabled:hover:bg-surface-2 enabled:hover:text-fg disabled:opacity-40"
            >
              <ArrowLeft size={17} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Go forward"
              disabled={nav.pos >= nav.seq}
              onClick={() => history.forward()}
              className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 enabled:hover:bg-surface-2 enabled:hover:text-fg disabled:opacity-40"
            >
              <ArrowRight size={17} aria-hidden />
            </button>
          </div>
          {view?.kind === 'space' && activeSpace ? (
            <SpaceHeading name={activeSpace.name} icon={activeSpace.icon} collections={spaceCollections.length} tabs={spaceTabCount} />
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
              {!cards.some((c) => c.starred) && (
                <li>
                  <EmptyState
                    icon={<Star />}
                    title="Nothing starred yet"
                    hint="Star a link to keep it here — the star is in the row's action bar."
                    action={
                      firstSpaceId !== undefined ? (
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2"
                          onClick={() => navigate({ kind: 'space', spaceId: firstSpaceId })}
                        >
                          Open a space
                        </button>
                      ) : undefined
                    }
                  />
                </li>
              )}
            </ul>
          )}

          {!searching && view?.kind === 'duplicates' && (
            <DuplicatesView
              groups={data.duplicates.map((g) => ({ ...g, collections: collectionById }))}
              cardActions={cardActions}
            />
          )}

          {view?.kind === 'dashboard' && (
            <DashboardPage spaces={spaces} collections={collections} cards={cards} tags={tags} hashtags={hashtags} activity={data.activity} />
          )}

          {view?.kind === 'bookmarks' && <BookmarksPage cards={cards} run={run} />}

          {view?.kind === 'settings' && <SettingsView onError={reportError} />}

          {view?.kind === 'organizer' && (
            <TabOrganizer
              access={tabsCtl.access}
              groupsAccess={tabsCtl.groupsAccess}
              windows={tabsCtl.windows}
              error={tabsCtl.error}
              selected={tabsCtl.selected}
              onToggle={tabsCtl.toggle}
              onFocus={tabsCtl.focus}
              onCloseTab={tabsCtl.closeTab}
              onSaveGroup={tabsCtl.saveGroup}
              onMoveToGroup={tabsCtl.moveToGroup}
              onMoveToUngrouped={tabsCtl.moveToUngrouped}
              onUngroup={tabsCtl.ungroup}
              onCreateGroup={tabsCtl.createGroup}
              onUpdateGroup={tabsCtl.updateGroup}
              onGrant={tabsCtl.grant}
              onGrantGroups={tabsCtl.grantGroups}
            />
          )}

          {view?.kind === 'tags' && (
            <TagsPage
              tags={tags}
              usage={tagUsage}
              onCreate={(t, color) => void run('Creating tag', async () => void (await repo.createTag(t, color)))}
              onUpdate={(id, patch) => void run('Updating tag', () => repo.updateTag(id, patch))}
              onDelete={(id) => void run('Deleting tag', async () => undoable(await repo.deleteTag(id)))}
              onDeleteUnused={() => void run('Deleting unused tags', async () => undoable(await repo.deleteUnusedTags()))}
            />
          )}

          {view?.kind === 'hashtags' && (
            <HashtagsPage
              hashtags={hashtags}
              cards={cards}
              usage={hashtagUsage}
              onCreate={(name) => void run('Creating hashtag', async () => void (await repo.ensureHashtag(name)))}
              onRename={(id, name) => void run('Renaming hashtag', () => repo.renameHashtag(id, name))}
              onDelete={(id) => void run('Deleting hashtag', async () => undoable(await repo.deleteHashtag(id)))}
              onMerge={(from, into) => void run('Merging hashtags', async () => undoable(await repo.mergeHashtag(from, into)))}
              onRemoveFrom={(card, hashtagId) =>
                void run('Removing hashtag', () =>
                  repo.setCardLabels(card.id, { tagIds: card.tagIds, hashtagIds: card.hashtagIds.filter((h) => h !== hashtagId) }),
                )
              }
              onDeleteUnused={() => void run('Deleting unused hashtags', async () => undoable(await repo.deleteUnusedHashtags()))}
            />
          )}

          {!searching && inboxViewActive && inboxDefault && settings && (
            <InboxPage
              collections={inboxCollections}
              cards={inboxCards(spaces, collections, cards)}
              sort={settings.inboxSort}
              group={settings.inboxGroup}
              onSort={(inboxSort: InboxSort) => saveSetting('Saving the Inbox view', { inboxSort })}
              onGroup={(inboxGroup: InboxGroup) => saveSetting('Saving the Inbox view', { inboxGroup })}
              selection={selection}
              cardActions={cardActions}
              editor={{
                cardId: inboxSlot.cardId,
                adding: inboxSlot.collectionId === inboxDefault.id && inboxSlot.cardId === null,
                render: (card) => inboxSlot.render(card ? (collectionById.get(card.collectionId) ?? inboxDefault) : inboxDefault, card),
              }}
              onAdd={() => editor.openAdd(inboxDefault.id)}
              onSuggest={
                aiReady && settings
                  ? (targets) =>
                      void run('Suggesting labels', async () => {
                        const { items, skipped } = await proposeDetails(platform, settings.ai, targets);
                        setDialog({ kind: 'ai-details', title: 'Suggested labels and collections', items, skipped });
                      })
                  : undefined
              }
              onReadPages={(ids) => void reading.read(ids)}
              pagesEnabled={settings.fetchDescriptions}
              pagesBusy={reading.busy}
              pagesNote={reading.note}
              onDropTabs={(tabIds) => void tabsCtl.addTabs(tabIds, { kind: 'collection', collectionId: inboxDefault.id, before: null })}
              onDropLinks={(raw) =>
                void run('Adding the dropped links', async () => {
                  const links = await guard(parseDraggedLinks(raw));
                  if (links && links.length > 0) await repo.addCards(inboxDefault.id, links);
                })
              }
            />
          )}

          {!searching && view?.kind === 'space' && spaceId && !inboxViewActive && (
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
                selection={selection}
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
        {view?.kind === 'space' && pickedIds.length > 0 && (
          <BulkBar
            count={pickedIds.length}
            allStarred={pickedCards.every((c) => c.starred)}
            onClear={clearPicked}
            onMove={() => setDialog({ kind: 'move-many', ids: pickedIds })}
            onLabels={() => setDialog({ kind: 'bulk-labels', ids: pickedIds })}
            onInbox={() => bulk('Moving to Inbox', () => moveToInbox(db, pickedIds))}
            hideInbox={inboxViewActive}
            onStar={() => bulk('Updating tabs', () => repo.setStarred(pickedIds, !pickedCards.every((c) => c.starred)))}
            onDelete={() => bulk('Deleting tabs', async () => undoable(await repo.deleteCards(pickedIds)))}
          />
        )}
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
          onExpand={() => navigate({ kind: 'organizer' })}
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
        <SpaceDialog
          mode="create"
          onClose={() => setDialog(null)}
          onSubmit={({ name, icon }) =>
            run('Creating space', async () => {
              const space = await repo.createSpace(name, icon);
              navigate({ kind: 'space', spaceId: space.id });
            })
          }
        />
      )}
      {dialog?.kind === 'rename-space' && (
        <SpaceDialog
          mode="edit"
          initialName={dialog.space.name}
          initialIcon={dialog.space.icon}
          onClose={() => setDialog(null)}
          onSubmit={(values) => run('Saving space', () => repo.updateSpace(dialog.space.id, values))}
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
      {dialog?.kind === 'move-many' && (
        <MoveCardDialog
          spaces={spaces}
          collections={collections}
          currentCollectionId={null}
          count={dialog.ids.length}
          onClose={() => setDialog(null)}
          onSubmit={(target) => run('Moving tabs', () => repo.moveCards(dialog.ids, target)).then(clearPicked)}
        />
      )}
      {dialog?.kind === 'bulk-labels' && (
        <BulkLabelsDialog
          count={dialog.ids.length}
          labels={labelsApi}
          onClose={() => setDialog(null)}
          onSubmit={(labels) => run('Adding labels', () => repo.addLabelsToCards(dialog.ids, labels)).then(clearPicked)}
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
          title={dialog.title}
          items={dialog.items}
          skipped={dialog.skipped}
          onClose={() => setDialog(null)}
          onApply={(selected, move) =>
            run('Applying suggestions', async () => {
              await applyCardDetails(
                db,
                repo,
                selected.map((i) => ({ cardId: i.card.id, note: i.details.note, tags: i.details.tags, hashtags: i.details.hashtags, destination: i.details.destination })),
                { tagColors: SWATCHES.map((sw) => sw.value), move },
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
          onDelete={(id) => run('Deleting tag', async () => undoable(await repo.deleteTag(id)))}
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
              const approved = await guard(tabs);
              if (!approved || approved.length === 0) return;
              const keep = new Set(approved.map((t) => t.id));
              if (groups) {
                await applyGroups(
                  db,
                  repo,
                  spaceId,
                  groups.map((g) => ({ title: g.title, cards: g.tabs.filter((t) => keep.has(t.id)).map(toCard), tags: g.tags, hashtags: g.hashtags })),
                );
              } else {
                const targetId = collectionId ?? (await repo.createCollection(spaceId, newTitle)).id;
                await repo.addCards(targetId, approved.map(toCard));
              }
              if (closeTabs) await platform.tabs.closeTabs(approved.map((t) => t.id));
            })
          }
        />
      )}
      {paletteOpen && (
        <CommandPalette
          spaces={spaces}
          collections={collections}
          cards={cards}
          tags={tags}
          hashtags={hashtags}
          onClose={() => setPaletteOpen(false)}
          onOpenLink={(c) => {
            setPaletteOpen(false);
            void run('Opening link', () => platform.tabs.openUrl(c.url));
          }}
          onGoCollection={(col) => {
            setPaletteOpen(false);
            navigate({ kind: 'space', spaceId: col.spaceId });
            void run('Opening collection', () => repo.updateCollection(col.id, { expanded: true }));
            // The section mounts after navigation (and after the expand lands); poll the next frames for it.
            let tries = 0;
            const reveal = () => {
              const el = document.querySelector(`[data-collection-id="${col.id}"]`);
              if (el) el.scrollIntoView({ block: 'center' });
              else if (++tries < 30) requestAnimationFrame(reveal);
            };
            requestAnimationFrame(reveal);
          }}
          onNavigate={(v) => {
            setPaletteOpen(false);
            navigate(v);
          }}
        />
      )}
      <UndoToast
        deletion={undo}
        onUndo={(deletion) => {
          setUndo(null);
          void run('Restoring', () => repo.restoreDeletion(deletion));
        }}
        onDismiss={() => setUndo(null)}
      />
    </div>
    </LabelsProvider>
  );
}
