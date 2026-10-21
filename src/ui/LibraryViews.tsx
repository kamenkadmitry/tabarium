import type { Card, Collection, Space } from '../core/types';
import type { OpenTab } from '../platform/ports';
import { CardRow, type CardRowActions, hostOf } from './CardRow';

interface ResultGroup {
  collection: Collection;
  space: Space | undefined;
  cards: Card[];
}

export function SearchResults(props: {
  groups: readonly ResultGroup[];
  query: string;
  cardActions: (card: Card) => CardRowActions;
  /** Currently open browser tabs that match the query (not saved yet). */
  openTabs: readonly OpenTab[];
  onFocusTab: (tabId: number) => void;
  onAddOpenTab: (tabId: number) => void;
}) {
  if (props.groups.length === 0 && props.openTabs.length === 0) {
    return <p className="mt-16 text-center text-muted">No tabs match “{props.query}”.</p>;
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {props.openTabs.length > 0 && (
        <section aria-label="Open tabs" className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-bold">Open tabs</h2>
          <ul className="p-2">
            {props.openTabs.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface-2">
                <button type="button" onClick={() => props.onFocusTab(t.id)} className="min-w-0 flex-1 py-1.5 text-left">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{hostOf(t.url)} · open in the browser</span>
                </button>
                <button
                  type="button"
                  aria-label={`Add ${t.title} to a collection`}
                  onClick={() => props.onAddOpenTab(t.id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface"
                >
                  Add to collection
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {props.groups.map(({ collection, space, cards }) => (
        <section key={collection.id} aria-label={collection.title} className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-bold">
            <span className="text-muted">{space?.name} / </span>
            {collection.title}
          </h2>
          <ul className="p-2">
            {cards.map((c) => (
              <CardRow key={c.id} card={c} draggable={false} {...props.cardActions(c)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DuplicatesView(props: {
  groups: readonly { url: string; cards: Card[]; collections: Map<string, Collection> }[];
  cardActions: (card: Card) => CardRowActions;
}) {
  if (props.groups.length === 0) return <p className="mt-16 text-center text-muted">No duplicate tabs. Tidy library!</p>;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {props.groups.map((g) => (
        <section key={g.url} className="rounded-2xl border border-line bg-surface">
          <h2 className="truncate border-b border-line px-4 py-3 text-sm font-bold">{hostOf(g.url)}</h2>
          <ul className="p-2">
            {g.cards.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                draggable={false}
                meta={`in ${g.collections.get(c.collectionId)?.title ?? 'unknown collection'}`}
                {...props.cardActions(c)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
