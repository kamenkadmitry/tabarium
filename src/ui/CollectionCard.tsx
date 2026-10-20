import { ExternalLink, MoreHorizontal, Play, Star, Trash2 } from 'lucide-react';
import type { Card, Collection } from '../core/types';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

function hostOf(url: string): string {
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

function CardRow({ card }: { card: Card }) {
  const title = card.customTitle ?? card.title;
  return (
    <li className="group relative">
      <a
        href={card.url}
        className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2"
      >
        <Favicon card={card} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
        </span>
      </a>
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={card.starred ? 'Remove star' : 'Star tab'}
          className="grid size-8 place-items-center rounded-md bg-surface-2 text-muted hover:text-accent"
        >
          <Star size={15} aria-hidden fill={card.starred ? 'currentColor' : 'none'} />
        </button>
        <button type="button" aria-label="Delete tab" className="grid size-8 place-items-center rounded-md bg-surface-2 text-muted hover:text-danger">
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function CollectionCard({ collection, cards }: { collection: Collection; cards: readonly Card[] }) {
  return (
    <section
      aria-label={collection.title}
      className="flex break-inside-avoid flex-col rounded-2xl border border-line bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span
          aria-hidden
          className="h-5 w-1.5 shrink-0 rounded-full"
          style={{ background: collection.color ?? 'var(--border)' }}
        />
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">{collection.title}</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{cards.length}</span>
        <button type="button" aria-label="Open all tabs" className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-primary">
          <ExternalLink size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Collection menu" className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </header>
      <ul className="flex flex-col gap-0.5 p-2">
        {cards.map((c) => (
          <CardRow key={c.id} card={c} />
        ))}
      </ul>
      <footer className="border-t border-line p-2">
        <button type="button" className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary transition-colors duration-150 hover:bg-surface-2">
          <Play size={14} aria-hidden /> Restore session
        </button>
      </footer>
    </section>
  );
}
