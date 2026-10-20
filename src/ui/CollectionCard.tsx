import { ExternalLink, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Card, Collection } from '../core/types';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function Favicon({ card }: { card: Card }) {
  const host = hostOf(card.url);
  if (card.favIconUrl) {
    return <img src={card.favIconUrl} alt="" className="size-5 shrink-0 rounded" />;
  }
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded text-[11px] font-bold text-white"
      style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {host[0]?.toUpperCase()}
    </span>
  );
}

const iconButton =
  'grid size-8 place-items-center rounded-md bg-surface-2 text-muted transition-colors duration-150';

export function CardRow(props: { card: Card; onToggleStar: () => void; onDelete: () => void }) {
  const { card } = props;
  return (
    <li className="group relative">
      <a
        href={card.url}
        className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2"
      >
        <Favicon card={card} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{card.customTitle ?? card.title}</span>
          <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
        </span>
        {card.starred && <Star size={14} aria-label="Starred" className="shrink-0 text-accent" fill="currentColor" />}
      </a>
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 bg-surface-2 pl-1 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          aria-label={card.starred ? 'Remove star' : 'Star tab'}
          onClick={props.onToggleStar}
          className={`${iconButton} hover:text-accent`}
        >
          <Star size={15} aria-hidden fill={card.starred ? 'currentColor' : 'none'} />
        </button>
        <button type="button" aria-label="Delete tab" onClick={props.onDelete} className={`${iconButton} hover:text-danger`}>
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

interface Props {
  collection: Collection;
  cards: readonly Card[];
  onAddLink: () => void;
  onOpenAll: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleStar: (card: Card) => void;
  onDeleteCard: (card: Card) => void;
}

export function CollectionCard(props: Props) {
  const { collection, cards } = props;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section aria-label={collection.title} className="flex break-inside-avoid flex-col rounded-2xl border border-line bg-surface">
      <header className="relative flex items-center gap-2 border-b border-line px-4 py-3">
        <span aria-hidden className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: collection.color ?? 'var(--border)' }} />
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">{collection.title}</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{cards.length}</span>
        <button
          type="button"
          aria-label="Open all tabs"
          disabled={cards.length === 0}
          onClick={props.onOpenAll}
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
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-3 top-12 z-10 w-44 rounded-xl border border-line bg-surface p-1"
            onClick={() => setMenuOpen(false)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button role="menuitem" type="button" onClick={props.onRename} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-surface-2">
              <Pencil size={15} aria-hidden /> Rename
            </button>
            <button role="menuitem" type="button" onClick={props.onDelete} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-danger hover:bg-surface-2">
              <Trash2 size={15} aria-hidden /> Delete collection
            </button>
          </div>
        )}
      </header>
      {cards.length > 0 ? (
        <ul className="flex flex-col gap-0.5 p-2">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} onToggleStar={() => props.onToggleStar(c)} onDelete={() => props.onDeleteCard(c)} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center text-sm text-muted">Empty. Add a link or save your open tabs.</p>
      )}
      <footer className="border-t border-line p-2">
        <button type="button" onClick={props.onAddLink} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary transition-colors duration-150 hover:bg-surface-2">
          <Plus size={15} aria-hidden /> Add link
        </button>
      </footer>
    </section>
  );
}
