import { Clock, ExternalLink, GripVertical, MoreHorizontal, Palette, Pencil, Plus, RefreshCw, Sparkles, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Card, Collection, Tag } from '../core/types';
import { CardRow, type CardRowActions } from './CardRow';
import { SWATCHES } from './colors';
import { dragSourceProps, endDrag, getDragPayload } from './dnd';

export interface CollectionActions {
  addLink: () => void;
  openAll: () => void;
  /** Present only when an AI provider is configured. */
  suggestName?: () => void;
  /** Close the other tabs of this window and open this collection instead. */
  replaceWindow: () => void;
  rename: () => void;
  remove: () => void;
  editTags: () => void;
  setColor: (color: string | null) => void;
  addAllToNext: () => void;
  card: (card: Card) => CardRowActions;
  dropCard: (cardId: string, beforeCardId: string | null) => void;
  /** Browser tabs were dropped on this collection: add them before `beforeCardId` (end when null). */
  dropTabs: (tabIds: number[], beforeCardId: string | null) => void;
  /** A collection was dropped onto this one: place it before this one. */
  dropCollection: (collectionId: string) => void;
}

interface Props {
  collection: Collection;
  cards: readonly Card[];
  tags: readonly Tag[];
  actions: CollectionActions;
}

const menuItem = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-surface-2';

function CollectionMenu({ collection, actions, onClose }: { collection: Collection; actions: CollectionActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div ref={ref} role="menu" className="absolute right-3 top-12 z-10 w-56 rounded-xl border border-line bg-surface p-1">
      <button role="menuitem" type="button" onClick={run(actions.rename)} className={menuItem}>
        <Pencil size={15} aria-hidden /> Rename
      </button>
      <button role="menuitem" type="button" onClick={run(actions.replaceWindow)} className={menuItem}>
        <RefreshCw size={15} aria-hidden /> Replace window tabs
      </button>
      {actions.suggestName && (
        <button role="menuitem" type="button" onClick={run(actions.suggestName)} className={menuItem}>
          <Sparkles size={15} aria-hidden /> Suggest name (AI)
        </button>
      )}
      <button role="menuitem" type="button" onClick={run(actions.editTags)} className={menuItem}>
        <TagIcon size={15} aria-hidden /> Tags…
      </button>
      <button role="menuitem" type="button" onClick={run(actions.addAllToNext)} className={menuItem}>
        <Clock size={15} aria-hidden /> Add all to Next
      </button>
      <div className="px-3 py-2">
        <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
          <Palette size={13} aria-hidden /> Colour
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-label={s.name}
              aria-pressed={collection.color === s.value}
              onClick={run(() => actions.setColor(s.value))}
              className="size-6 rounded-full border-2 border-transparent aria-pressed:border-fg"
              style={{ background: s.value }}
            />
          ))}
          <button type="button" onClick={run(() => actions.setColor(null))} className="h-6 rounded-full border border-line px-2 text-xs">
            None
          </button>
        </div>
      </div>
      <button role="menuitem" type="button" onClick={run(actions.remove)} className={`${menuItem} text-danger`}>
        <Trash2 size={15} aria-hidden /> Delete collection
      </button>
    </div>
  );
}

export function CollectionCard({ collection, cards, tags, actions }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  /** undefined = no drag over; null = indicator at the end; string = before that card id. */
  const [indicator, setIndicator] = useState<string | null | undefined>(undefined);
  const [collectionOver, setCollectionOver] = useState(false);

  const clear = () => {
    setIndicator(undefined);
    setCollectionOver(false);
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    const payload = getDragPayload();
    if (!payload || payload.type === 'next') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (payload.type === 'collection') {
      if (payload.id !== collection.id) setCollectionOver(true);
      return;
    }
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-card-id]');
    if (!row) {
      setIndicator(null);
      return;
    }
    const idx = cards.findIndex((c) => c.id === row.dataset.cardId);
    const rect = row.getBoundingClientRect();
    const upper = e.clientY < rect.top + rect.height / 2;
    setIndicator(upper ? (cards[idx]?.id ?? null) : (cards[idx + 1]?.id ?? null));
  };

  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const payload = endDrag();
    const before = indicator ?? null;
    clear();
    if (!payload) return;
    if (payload.type === 'card') actions.dropCard(payload.id, before);
    else if (payload.type === 'tabs') actions.dropTabs(payload.tabIds, before);
    else if (payload.type === 'collection' && payload.id !== collection.id) actions.dropCollection(payload.id);
  };

  return (
    <section
      aria-label={collection.title}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear();
      }}
      onDrop={onDrop}
      className={`flex break-inside-avoid flex-col rounded-2xl border bg-surface ${collectionOver ? 'border-primary' : 'border-line'}`}
    >
      <header className="relative flex items-center gap-2 border-b border-line px-3 py-3">
        <span
          {...dragSourceProps({ type: 'collection', id: collection.id })}
          aria-label="Drag collection"
          className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted hover:bg-surface-2"
        >
          <GripVertical size={16} aria-hidden />
        </span>
        <span aria-hidden className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: collection.color ?? 'var(--border)' }} />
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">{collection.title}</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{cards.length}</span>
        <button
          type="button"
          aria-label="Open all tabs"
          disabled={cards.length === 0}
          onClick={actions.openAll}
          className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-primary disabled:opacity-40"
        >
          <ExternalLink size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Collection menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
        {menuOpen && <CollectionMenu collection={collection} actions={actions} onClose={() => setMenuOpen(false)} />}
      </header>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3" aria-label="Tags">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">
              <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
              {t.title}
            </li>
          ))}
        </ul>
      )}

      {cards.length > 0 ? (
        <ul className="flex flex-col gap-0.5 p-2">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} dropAbove={indicator === c.id} {...actions.card(c)} />
          ))}
          {indicator === null && <li aria-hidden className="mx-1 h-0.5 rounded bg-primary" />}
        </ul>
      ) : (
        <p className={`px-4 py-5 text-center text-sm text-muted ${indicator === null ? 'text-primary' : ''}`}>
          Empty. Add a link, drop a tab here, or save your open tabs.
        </p>
      )}
      <footer className="border-t border-line p-2">
        <button type="button" onClick={actions.addLink} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary transition-colors duration-150 hover:bg-surface-2">
          <Plus size={15} aria-hidden /> Add link
        </button>
      </footer>
    </section>
  );
}
