import { ChevronDown, ChevronRight, Clock, ExternalLink, GripVertical, MoreHorizontal, Palette, Pencil, Plus, RefreshCw, Sparkles, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Card, Collection, Tag } from '../core/types';
import type { BoardView } from '../core/boardTypes';
import { CardRow, type CardDensity, type CardRowActions } from './CardRow';
import { SWATCHES } from './colors';
import { dragSourceProps, endDrag, getDragPayload } from './dnd';

export interface CollectionActions {
  /** Fold or unfold the collection's tabs. */
  toggleExpanded: () => void;
  addLink: () => void;
  openAll: () => void;
  /** Present only when an AI provider is configured. */
  suggestName?: () => void;
  /** Present only when an AI provider is configured: propose notes, tags and hashtags for links that have none. */
  suggestDetails?: () => void;
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

/** Where the inline editor is open on the board, and how to draw it. */
export interface EditorSlot {
  /** Card being edited, if the editor is open on a row of this collection. */
  cardId: string | null;
  /** The "add link" editor is open at the end of this collection. */
  adding: boolean;
  render: (card: Card | null) => React.ReactNode;
}

interface Props {
  collection: Collection;
  cards: readonly Card[];
  tags: readonly Tag[];
  actions: CollectionActions;
  view: BoardView;
  /** Manual drag-reordering is offered only while the board uses "Custom order". */
  reorderable: boolean;
  editor: EditorSlot;
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
      {actions.suggestDetails && (
        <button role="menuitem" type="button" onClick={run(actions.suggestDetails)} className={menuItem}>
          <Sparkles size={15} aria-hidden /> Fill details (AI)
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

const DENSITY: Record<BoardView, CardDensity> = { grid: 'default', compact: 'compact', list: 'wide', card: 'tile' };

function TagChips({ tags, className = '' }: { tags: readonly Tag[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Tags">
      {tags.map((t) => (
        <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">
          <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
          {t.title}
        </li>
      ))}
    </ul>
  );
}

export function CollectionCard({ collection, cards, tags, actions, view, reorderable, editor }: Props) {
  const expanded = collection.expanded;
  const density = DENSITY[view];
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
      <div aria-hidden className="h-1 shrink-0 rounded-t-2xl" style={{ background: collection.color ?? 'var(--border)' }} />
      <header className="relative flex items-center gap-2 border-b border-line px-3 py-3">
        <button
          type="button"
          aria-label={expanded ? `Collapse ${collection.title}` : `Expand ${collection.title}`}
          aria-expanded={expanded}
          onClick={actions.toggleExpanded}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2"
        >
          {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </button>
        {reorderable && (
          <span
            {...dragSourceProps({ type: 'collection', id: collection.id })}
            aria-label="Drag collection"
            className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted hover:bg-surface-2"
          >
            <GripVertical size={16} aria-hidden />
          </span>
        )}
        <h2 className={`min-w-0 truncate text-base font-bold ${view === 'list' ? '' : 'flex-1'}`}>{collection.title}</h2>
        {view === 'list' && <TagChips tags={tags} className="min-w-0 flex-1" />}
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

      {view !== 'list' && <TagChips tags={tags} className="px-4 pt-3" />}

      {!expanded ? null : cards.length > 0 ? (
        <ul className={view === 'card' ? 'grid grid-cols-2 gap-2 p-3' : 'flex flex-col gap-0.5 p-2'}>
          {cards.flatMap((c, i) => {
            const rows = [<CardRow key={c.id} card={c} density={density} editing={editor.cardId === c.id} dropAbove={indicator === c.id} {...actions.card(c)} />];
            const editedIndex = editor.cardId === null ? -1 : cards.findIndex((x) => x.id === editor.cardId);
            // Tiles sit two to a row: the editor opens below the row that holds the edited tile.
            const after = view === 'card' ? Math.min(cards.length - 1, Math.floor(editedIndex / 2) * 2 + 1) : editedIndex;
            if (editedIndex >= 0 && i === after) {
              rows.push(
                <li key={`${c.id}-editor`} className={view === 'card' ? 'col-span-2' : ''}>
                  {editor.render(cards[editedIndex] ?? null)}
                </li>,
              );
            }
            return rows;
          })}
          {indicator === null && <li aria-hidden className="mx-1 h-0.5 rounded bg-primary" />}
        </ul>
      ) : (
        <p className={`px-4 py-5 text-center text-sm text-muted ${indicator === null ? 'text-primary' : ''}`}>
          Empty. Add a link, drop a tab here, or save your open tabs.
        </p>
      )}
      {expanded && (
        <footer className="border-t border-line p-2">
          {editor.adding ? (
            editor.render(null)
          ) : (
            <button type="button" onClick={actions.addLink} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm font-semibold text-primary transition-colors duration-150 hover:bg-surface-2">
              <Plus size={15} aria-hidden /> Add link
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
