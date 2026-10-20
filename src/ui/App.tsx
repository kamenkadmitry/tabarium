import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPlus, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, repo } from '../core/instance';
import { loadSettings } from '../core/settings';
import type { Card } from '../core/types';
import { usePlatform } from '../platform/context';
import type { OpenTab } from '../platform/ports';
import { CardRow, CollectionCard } from './CollectionCard';
import { AddLinkDialog } from './dialogs/AddLinkDialog';
import { PromptDialog } from './dialogs/PromptDialog';
import { SaveSessionDialog } from './dialogs/SaveSessionDialog';
import { SettingsView } from './SettingsView';
import { Sidebar, type View } from './Sidebar';

type DialogState =
  | { kind: 'space' }
  | { kind: 'collection' }
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'link'; collectionId: string; title: string }
  | { kind: 'session'; tabs: OpenTab[] };

export function App() {
  const platform = usePlatform();
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const cards = useLiveQuery(() => db.cards.orderBy('position').toArray(), []);
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useLiveQuery(() => loadSettings(db), []);
  const theme = settings?.theme;
  useEffect(() => {
    if (theme === undefined) return;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const first = spaces?.[0];
    if (view === null && first) setView({ kind: 'space', spaceId: first.id });
  }, [spaces, view]);

  /** Runs a user-triggered action; expected failures are logged with context and shown to the user. */
  const reportError = (what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
  };
  const run = async (what: string, action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
    } catch (e) {
      reportError(what, e);
    }
  };

  if (!spaces || !collections || !cards) return null;

  const cardsByCollection = new Map<string, Card[]>();
  for (const c of cards) {
    const list = cardsByCollection.get(c.collectionId) ?? [];
    list.push(c);
    cardsByCollection.set(c.collectionId, list);
  }

  const q = query.trim().toLowerCase();
  const activeSpace = view?.kind === 'space' ? spaces.find((s) => s.id === view.spaceId) : undefined;
  const visible = collections
    .filter((c) => activeSpace !== undefined && c.spaceId === activeSpace.id)
    .map((c) => {
      const all = cardsByCollection.get(c.id) ?? [];
      const matching = q ? all.filter((x) => `${x.title} ${x.url}`.toLowerCase().includes(q)) : all;
      return { collection: c, cards: matching, hit: q === '' || c.title.toLowerCase().includes(q) || matching.length > 0 };
    })
    .filter((x) => x.hit);
  const starred = cards.filter((c) => c.starred);

  const openSaveSession = () =>
    run('Opening Save session', async () => {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read your open tabs.');
      }
      setDialog({ kind: 'session', tabs: await platform.tabs.listWindowTabs() });
    });

  const openAll = (list: readonly Card[]) =>
    run('Opening tabs', () => platform.tabs.openUrls(list.map((c) => c.url)));

  const spaceId = activeSpace?.id;
  const titleByKind = { starred: 'Starred', next: 'Next', settings: 'Settings' } as const;
  const titleText = view && view.kind !== 'space' ? titleByKind[view.kind] : (activeSpace?.name ?? 'Library');
  const showLibraryTools = view?.kind === 'space';

  return (
    <div className="flex h-full">
      <Sidebar spaces={spaces} view={view} onSelect={setView} onCreateSpace={() => setDialog({ kind: 'space' })} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">{titleText}</h1>
          {showLibraryTools && (
          <label className="relative ml-4 max-w-md flex-1">
            <span className="sr-only">Search tabs</span>
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tabs and collections"
              className="h-10 w-full rounded-lg border border-line bg-bg pl-9 pr-3 text-sm placeholder:text-muted"
            />
          </label>
          )}
          {showLibraryTools && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={spaceId === undefined}
              onClick={() => setDialog({ kind: 'collection' })}
              className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
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
          {view?.kind === 'starred' && (
            <ul className="max-w-xl rounded-2xl border border-line bg-surface p-2">
              {starred.map((c) => (
                <CardRow
                  key={c.id}
                  card={c}
                  onToggleStar={() => void run('Updating tab', () => repo.updateCard(c.id, { starred: !c.starred }))}
                  onDelete={() => void run('Deleting tab', () => repo.deleteCard(c.id))}
                />
              ))}
              {starred.length === 0 && <li className="p-6 text-center text-sm text-muted">Star a tab to find it here.</li>}
            </ul>
          )}

          {view?.kind === 'settings' && <SettingsView onError={reportError} />}

          {view?.kind === 'next' &&<p className="mt-16 text-center text-muted">The Next queue is coming soon.</p>}

          {view?.kind === 'space' && (
            <>
              <div className="columns-1 gap-5 space-y-5 md:columns-2 xl:columns-3">
                {visible.map(({ collection, cards: list }) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    cards={list}
                    onAddLink={() => setDialog({ kind: 'link', collectionId: collection.id, title: collection.title })}
                    onOpenAll={() => void openAll(list)}
                    onRename={() => setDialog({ kind: 'rename-collection', id: collection.id, title: collection.title })}
                    onDelete={() => {
                      if (confirm(`Delete “${collection.title}” and its ${list.length} tabs?`)) {
                        void run('Deleting collection', () => repo.deleteCollection(collection.id));
                      }
                    }}
                    onToggleStar={(c) => void run('Updating tab', () => repo.updateCard(c.id, { starred: !c.starred }))}
                    onDeleteCard={(c) => void run('Deleting tab', () => repo.deleteCard(c.id))}
                  />
                ))}
              </div>
              {visible.length === 0 && (
                <p className="mt-16 text-center text-muted">No collections here yet. Create one or save your open tabs.</p>
              )}
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
      {dialog?.kind === 'collection' && spaceId && (
        <PromptDialog
          title="New collection"
          label="Collection name"
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(title) => run('Creating collection', async () => void (await repo.createCollection(spaceId, title)))}
        />
      )}
      {dialog?.kind === 'rename-collection' && (
        <PromptDialog
          title="Rename collection"
          label="Collection name"
          submitLabel="Save"
          initialValue={dialog.title}
          onClose={() => setDialog(null)}
          onSubmit={(title) => run('Renaming collection', () => repo.updateCollection(dialog.id, { title }))}
        />
      )}
      {dialog?.kind === 'link' && (
        <AddLinkDialog
          collectionTitle={dialog.title}
          onClose={() => setDialog(null)}
          onSubmit={(link) => run('Adding link', async () => void (await repo.addCards(dialog.collectionId, [link])))}
        />
      )}
      {dialog?.kind === 'session' && spaceId && (
        <SaveSessionDialog
          tabs={dialog.tabs}
          collections={collections.filter((c) => c.spaceId === spaceId)}
          onClose={() => setDialog(null)}
          onSave={({ tabs, collectionId, newTitle, closeTabs }) =>
            run('Saving session', async () => {
              const targetId = collectionId ?? (await repo.createCollection(spaceId, newTitle)).id;
              await repo.addCards(
                targetId,
                tabs.map((t) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl })),
              );
              if (closeTabs) await platform.tabs.closeTabs(tabs.map((t) => t.id));
            })
          }
        />
      )}
    </div>
  );
}
