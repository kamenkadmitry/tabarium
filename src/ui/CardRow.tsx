import { ArrowRightLeft, Clock, NotebookText, Pencil, Star, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { Card } from '../core/types';
import { dragSourceProps } from './dnd';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

export function Favicon({ card, size = 20 }: { card: Card; size?: number }) {
  const host = hostOf(card.url);
  const box = { width: size, height: size };
  if (card.favIconUrl) {
    return <img src={card.favIconUrl} alt="" style={box} className="shrink-0 rounded" />;
  }
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded font-bold text-white"
      style={{ ...box, fontSize: Math.round(size * 0.55), background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {host[0]?.toUpperCase()}
    </span>
  );
}

const iconButton = 'grid size-8 place-items-center rounded-md text-muted transition-colors duration-150';

export interface CardRowActions {
  onToggleStar: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: () => void;
  onNext: () => void;
}

/** How a tab is drawn: normal row, dense one-liner, wide row with the host on the right, or a tile. */
export type CardDensity = 'default' | 'compact' | 'wide' | 'tile';

interface Props extends CardRowActions {
  card: Card;
  /** Draws the drop indicator above this row. */
  dropAbove?: boolean;
  draggable?: boolean;
  density?: CardDensity;
  /** Extra text shown after the host, e.g. where a duplicate lives. */
  meta?: string;
  rowProps?: HTMLAttributes<HTMLLIElement>;
}

const LINK: Record<CardDensity, string> = {
  default: 'flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5',
  compact: 'flex min-h-8 items-center gap-2 rounded-md px-2 py-0.5',
  wide: 'flex min-h-10 items-center gap-3 rounded-lg px-3 py-1',
  tile: 'flex h-full min-h-24 flex-col items-start gap-2 rounded-xl border border-line px-3 py-3',
};

export function CardRow({ card, dropAbove, draggable = true, density = 'default', meta, rowProps, ...actions }: Props) {
  const title = card.customTitle ?? card.title;
  const tile = density === 'tile';
  return (
    <li
      {...rowProps}
      {...(draggable ? dragSourceProps({ type: 'card', id: card.id }) : {})}
      data-card-id={card.id}
      className={`group relative rounded-lg ${dropAbove ? 'before:absolute before:-top-px before:inset-x-1 before:h-0.5 before:rounded before:bg-primary' : ''}`}
    >
      <a href={card.url} draggable={false} className={`${LINK[density]} transition-colors duration-150 hover:bg-surface-2`}>
        <Favicon card={card} size={tile ? 24 : density === 'compact' ? 16 : 20} />
        <span className={`min-w-0 ${tile ? 'w-full' : 'flex-1'}`}>
          <span className={`block text-sm font-medium ${tile ? 'line-clamp-2' : 'truncate'}`}>{title}</span>
          {density !== 'compact' && density !== 'wide' && (
            <span className="block truncate text-xs text-muted">
              {hostOf(card.url)}
              {meta ? ` · ${meta}` : ''}
            </span>
          )}
        </span>
        {density === 'wide' && <span className="hidden max-w-[30%] shrink-0 truncate text-xs text-muted sm:block">{hostOf(card.url)}</span>}
        {card.note && !tile && <NotebookText size={14} aria-label="Has a note" className="shrink-0 text-muted" />}
        {card.starred && !tile && <Star size={14} aria-label="Starred" className="shrink-0 text-accent" fill="currentColor" />}
      </a>
      <div
        className={`pointer-events-none absolute flex items-center gap-0.5 rounded-lg bg-surface-2 pl-1 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
          tile ? 'right-1 top-1' : 'inset-y-0 right-1'
        }`}
      >
        <button type="button" aria-label="Edit tab and note" onClick={actions.onEdit} className={`${iconButton} hover:text-primary`}>
          <Pencil size={15} aria-hidden />
        </button>
        <button type="button" aria-label="Add to Next" onClick={actions.onNext} className={`${iconButton} hover:text-primary`}>
          <Clock size={15} aria-hidden />
        </button>
        <button type="button" aria-label="Move to another collection" onClick={actions.onMove} className={`${iconButton} hover:text-primary`}>
          <ArrowRightLeft size={15} aria-hidden />
        </button>
        <button type="button" aria-label={card.starred ? 'Remove star' : 'Star tab'} onClick={actions.onToggleStar} className={`${iconButton} hover:text-accent`}>
          <Star size={15} aria-hidden fill={card.starred ? 'currentColor' : 'none'} />
        </button>
        <button type="button" aria-label="Delete tab" onClick={actions.onDelete} className={`${iconButton} hover:text-danger`}>
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}
