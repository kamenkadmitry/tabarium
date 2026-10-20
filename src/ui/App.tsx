import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPlus, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../core/instance';
import type { Card } from '../core/types';
import { CollectionCard } from './CollectionCard';
import { Sidebar, type View } from './Sidebar';

export function App() {
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const cards = useLiveQuery(() => db.cards.orderBy('position').toArray(), []);
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const first = spaces?.[0];
    if (view === null && first) setView({ kind: 'space', spaceId: first.id });
  }, [spaces, view]);

  if (!spaces || !collections || !cards) return null;

  const cardsByCollection = new Map<string, Card[]>();
  for (const c of cards) {
    const list = cardsByCollection.get(c.collectionId) ?? [];
    list.push(c);
    cardsByCollection.set(c.collectionId, list);
  }

  const q = query.trim().toLowerCase();
  const visible = collections
    .filter((c) => view?.kind === 'space' && c.spaceId === view.spaceId)
    .map((c) => {
      const all = cardsByCollection.get(c.id) ?? [];
      const matching = q ? all.filter((x) => `${x.title} ${x.url}`.toLowerCase().includes(q)) : all;
      return { collection: c, cards: matching, hit: q === '' || c.title.toLowerCase().includes(q) || matching.length > 0 };
    })
    .filter((x) => x.hit);

  const activeSpace = view?.kind === 'space' ? spaces.find((s) => s.id === view.spaceId) : undefined;

  return (
    <div className="flex h-full">
      <Sidebar spaces={spaces} view={view} onSelect={setView} onCreateSpace={() => undefined} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight">{activeSpace?.name ?? 'Library'}</h1>
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
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2">
              <FolderPlus size={16} aria-hidden /> New collection
            </button>
            <button type="button" className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90">
              <Plus size={16} aria-hidden /> Save session
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="columns-1 gap-5 space-y-5 md:columns-2 xl:columns-3">
            {visible.map(({ collection, cards: list }) => (
              <CollectionCard key={collection.id} collection={collection} cards={list} />
            ))}
          </div>
          {visible.length === 0 && (
            <p className="mt-16 text-center text-muted">No collections here yet. Save your open tabs to get started.</p>
          )}
        </div>
      </main>
    </div>
  );
}
