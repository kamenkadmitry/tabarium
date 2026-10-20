import { Check, GripVertical, X } from 'lucide-react';
import { useState } from 'react';
import type { Card, Collection, NextItem, Space } from '../core/types';
import type { OpenTab } from '../platform/ports';
import { CardRow, type CardRowActions, Favicon, hostOf } from './CardRow';
import { dragSourceProps, endDrag, getDragPayload } from './dnd';

export interface NextEntry {
  item: NextItem;
  card: Card;
}

interface NextViewProps {
  entries: readonly NextEntry[];
  onToggle: (item: NextItem) => void;
  onRemove: (item: NextItem) => void;
  onMove: (nextId: string, beforeNextId: string | null) => void;
}

export function NextView({ entries, onToggle, onRemove, onMove }: NextViewProps) {
  const [over, setOver] = useState<string | null | undefined>(undefined);

  if (entries.length === 0) {
    return <p className="mt-16 text-center text-muted">Nothing queued. Use “Add to Next” on a tab to line it up.</p>;
  }

  return (
    <ul
      aria-label="Next queue"
      className="max-w-2xl rounded-2xl border border-line bg-surface p-2"
      onDragOver={(e) => {
        if (getDragPayload()?.type === 'next') e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const payload = endDrag();
        const before = over ?? null;
        setOver(undefined);
        if (payload?.type === 'next') onMove(payload.id, before);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(undefined);
      }}
    >
      {entries.map(({ item, card }, i) => (
        <li
          key={item.id}
          {...dragSourceProps({ type: 'next', id: item.id })}
          onDragOver={(e) => {
            if (getDragPayload()?.type !== 'next') return;
            const rect = e.currentTarget.getBoundingClientRect();
            setOver(e.clientY < rect.top + rect.height / 2 ? item.id : (entries[i + 1]?.item.id ?? null));
          }}
          className={`relative flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-surface-2 ${over === item.id ? 'before:absolute before:-top-px before:inset-x-1 before:h-0.5 before:bg-primary' : ''}`}
        >
          <GripVertical size={16} aria-hidden className="shrink-0 cursor-grab text-muted" />
          <button
            type="button"
            role="checkbox"
            aria-checked={item.state === 'done'}
            aria-label={`Mark ${card.customTitle ?? card.title} as ${item.state === 'done' ? 'to do' : 'done'}`}
            onClick={() => onToggle(item)}
            className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${item.state === 'done' ? 'border-primary bg-primary text-primary-fg' : 'border-line'}`}
          >
            {item.state === 'done' && <Check size={14} aria-hidden />}
          </button>
          <Favicon card={card} />
          <a href={card.url} draggable={false} className="min-w-0 flex-1 py-2">
            <span className={`block truncate text-sm font-medium ${item.state === 'done' ? 'text-muted line-through' : ''}`}>
              {card.customTitle ?? card.title}
            </span>
            <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
          </a>
          <button type="button" aria-label="Remove from Next" onClick={() => onRemove(item)} className="grid size-8 place-items-center rounded-md text-muted hover:text-danger">
            <X size={16} aria-hidden />
          </button>
        </li>
      ))}
      {over === null && <li aria-hidden className="mx-1 h-0.5 rounded bg-primary" />}
    </ul>
  );
}

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
