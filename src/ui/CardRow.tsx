import { ArrowRightLeft, Inbox, NotebookText, Pencil, Star, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { Card } from '../core/types';
import { dragSourceProps } from './dnd';
import { CardLabels } from './labels';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** The site's own icon when the browser gave us one, otherwise a coloured letter for the host. */
export function PageFavicon({ url, favIconUrl, size = 20 }: { url: string; favIconUrl: string | null | undefined; size?: number }) {
  const host = hostOf(url);
  const box = { width: size, height: size };
  if (favIconUrl) {
    return <img src={favIconUrl} alt="" style={box} className="shrink-0 rounded" />;
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

export function Favicon({ card, size = 20 }: { card: Card; size?: number }) {
  return <PageFavicon url={card.url} favIconUrl={card.favIconUrl} size={size} />;
}

const iconButton = 'grid size-8 place-items-center rounded-md text-muted transition-colors duration-150';

export interface CardRowActions {
  onToggleStar: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: () => void;
  /** Moves the link to the Inbox. Absent for links that already are there. */
  onInbox?: () => void;
}

/** How a tab is drawn: normal row, dense one-liner, wide row with the host on the right, or a tile. */
export type CardDensity = 'default' | 'compact' | 'wide' | 'tile';

interface Props extends CardRowActions {
  card: Card;
  /** Draws the drop indicator above this row. */
  dropAbove?: boolean;
  draggable?: boolean;
  density?: CardDensity;
  /** The editor is open under this row. */
  editing?: boolean;
  /** Selection for bulk actions; leave `onSelect` out where links cannot be selected. */
  selected?: boolean;
  /** Some link on the board is selected, so every row shows its checkbox. */
  selectionActive?: boolean;
  onSelect?: (shift: boolean) => void;
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

/** Where the checkbox sits: on top of the site icon, which it hides while it is shown. */
const BOX: Record<CardDensity, string> = {
  default: 'left-2 top-1/2 size-5 -translate-y-1/2',
  compact: 'left-2 top-1/2 size-4 -translate-y-1/2',
  wide: 'left-3 top-1/2 size-5 -translate-y-1/2',
  tile: 'left-3 top-3 size-6',
};

export function CardRow({ card, dropAbove, draggable = true, density = 'default', editing = false, selected = false, selectionActive = false, onSelect, meta, rowProps, ...actions }: Props) {
  const title = card.customTitle ?? card.title;
  const tile = density === 'tile';
  return (
    <li
      {...rowProps}
      {...(draggable ? dragSourceProps({ type: 'card', id: card.id }) : {})}
      data-card-id={card.id}
      onKeyDown={(e) => {
        // E on the focused link opens the editor, like the pencil.
        if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target as HTMLElement).tagName === 'A') {
          e.preventDefault();
          actions.onEdit();
        }
      }}
      className={`group relative rounded-lg ${editing || selected ? 'bg-surface-2 ring-1 ring-primary/60' : ''} ${dropAbove ? 'before:absolute before:-top-px before:inset-x-1 before:h-0.5 before:rounded before:bg-primary' : ''}`}
    >
      {onSelect && (
        <label
          className={`absolute z-[1] grid cursor-pointer place-items-center rounded bg-surface-2 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 ${BOX[density]} ${
            selected || selectionActive ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${title}`}
            // The click carries the Shift key; the change event does not, so the click does the work.
            onClick={(e) => onSelect(e.shiftKey)}
            onChange={() => undefined}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        </label>
      )}
      <a href={card.url} draggable={false} className={`${LINK[density]} transition-colors duration-150 hover:bg-surface-2`}>
        <Favicon card={card} size={tile ? 24 : density === 'compact' ? 16 : 20} />
        <span className={`min-w-0 ${tile ? 'w-full' : 'flex-1'}`}>
          <span className={`block text-sm font-medium ${tile ? 'line-clamp-2' : 'truncate'}`}>{title}</span>
          {(density === 'default' || density === 'tile') && (
            <CardLabels card={card} lead={`${hostOf(card.url)}${meta ? ` · ${meta}` : ''}`} limitHashtags={density === 'tile' ? 1 : 2} />
          )}
        </span>
        {density === 'compact' && <CardLabels card={card} variant="dots" />}
        {density === 'wide' && <CardLabels card={card} limitHashtags={2} className="hidden w-56 shrink-0 justify-end sm:flex" />}
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
        {actions.onInbox && (
          <button type="button" aria-label="Move to Inbox" onClick={actions.onInbox} className={`${iconButton} hover:text-primary`}>
            <Inbox size={15} aria-hidden />
          </button>
        )}
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
