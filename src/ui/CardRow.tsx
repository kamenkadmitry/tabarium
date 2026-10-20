import { ArrowRightLeft, Clock, NotebookText, Pencil, Star, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { Card } from '../core/types';
import { dragSourceProps } from './dnd';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

export function Favicon({ card }: { card: Card }) {
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

const iconButton = 'grid size-8 place-items-center rounded-md text-muted transition-colors duration-150';

export interface CardRowActions {
  onToggleStar: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: () => void;
  onNext: () => void;
}

interface Props extends CardRowActions {
  card: Card;
  /** Draws the drop indicator above this row. */
  dropAbove?: boolean;
  draggable?: boolean;
  /** Extra text shown after the host, e.g. where a duplicate lives. */
  meta?: string;
  rowProps?: HTMLAttributes<HTMLLIElement>;
}

export function CardRow({ card, dropAbove, draggable = true, meta, rowProps, ...actions }: Props) {
  return (
    <li
      {...rowProps}
      {...(draggable ? dragSourceProps({ type: 'card', id: card.id }) : {})}
      data-card-id={card.id}
      className={`group relative rounded-lg ${dropAbove ? 'before:absolute before:-top-px before:inset-x-1 before:h-0.5 before:rounded before:bg-primary' : ''}`}
    >
      <a
        href={card.url}
        draggable={false}
        className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2"
      >
        <Favicon card={card} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{card.customTitle ?? card.title}</span>
          <span className="block truncate text-xs text-muted">
            {hostOf(card.url)}
            {meta ? ` · ${meta}` : ''}
          </span>
        </span>
        {card.note && <NotebookText size={14} aria-label="Has a note" className="shrink-0 text-muted" />}
        {card.starred && <Star size={14} aria-label="Starred" className="shrink-0 text-accent" fill="currentColor" />}
      </a>
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-lg bg-surface-2 pl-1 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
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
