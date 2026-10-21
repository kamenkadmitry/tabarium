import { Check, ChevronDown, ChevronLeft, ChevronRight, FolderPlus, Layers } from 'lucide-react';
import { useState } from 'react';
import type { Card, Collection, Space } from '../../core/types';
import { normalizeUrl } from '../../core/url';
import { Favicon } from '../CardRow';
import { SpaceIcon } from '../spaceIcons';
import { inputClass } from '../Dialog';

export type Destination =
  | { kind: 'collection'; collectionId: string; label: string }
  | { kind: 'new'; spaceId: string; title: string; label: string };

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  /** Saved tabs per collection id: shown as a count, and as a list when the collection is expanded. */
  cardsByCollection?: ReadonlyMap<string, readonly Card[]>;
  /** Address of the tab being saved; collections that already hold it get a check mark. */
  currentUrl?: string | null;
  /** Filters collections across all spaces when not empty. */
  query: string;
  /** Offer "New collection…" inside a space. */
  allowNew?: boolean;
  /** Offer to pick a whole space (used when the result becomes several new collections). */
  pickSpace?: boolean;
  onPick: (destination: Destination) => void;
}

const row =
  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-surface-2';

/** Spaces list that drills into a space's collections, or a flat search over all collections. */
export function DestinationPicker({ spaces, collections, query, cardsByCollection, currentUrl, allowNew = true, pickSpace = false, onPick }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const holdsCurrent = (id: string) => {
    if (!currentUrl) return false;
    const key = normalizeUrl(currentUrl);
    return (cardsByCollection?.get(id) ?? []).some((c) => normalizeUrl(c.url) === key);
  };
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? '';
  const q = query.trim().toLowerCase();
  const countOf = (id: string) => {
    const n = cardsByCollection?.get(id)?.length;
    return n === undefined ? '' : ` · ${n} tab${n === 1 ? '' : 's'}`;
  };

  if (q !== '') {
    const hits = collections.filter((c) => `${c.title} ${spaceName(c.spaceId)}`.toLowerCase().includes(q));
    return (
      <ul aria-label="Matching collections" className="flex flex-col gap-0.5">
        {hits.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={row}
              onClick={() => onPick({ kind: 'collection', collectionId: c.id, label: `${spaceName(c.spaceId)} / ${c.title}` })}
            >
              <Layers size={16} aria-hidden className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">
                {c.title}
                <span className="text-xs font-normal text-muted">{countOf(c.id)}</span>
              </span>
              <span className="truncate text-xs text-muted">{spaceName(c.spaceId)}</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No collection matches “{query.trim()}”.</li>}
      </ul>
    );
  }

  const open = spaces.find((s) => s.id === openId);
  if (!open) {
    return (
      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted">Spaces</p>
        <ul aria-label="Spaces" className="flex flex-col gap-0.5">
          {spaces.map((s) => (
            <li key={s.id}>
              <button type="button" className={row} onClick={() => setOpenId(s.id)}>
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
                  <SpaceIcon icon={s.icon} name={s.name} size={s.icon ? 15 : 13} />
                </span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted">{collections.filter((c) => c.spaceId === s.id).length}</span>
                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
          {spaces.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No spaces yet. Open the library to create one.</li>}
        </ul>
      </div>
    );
  }

  const inSpace = collections.filter((c) => c.spaceId === open.id);
  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setOpenId(null);
            setNaming(false);
          }}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-surface-2"
        >
          <ChevronLeft size={16} aria-hidden className="shrink-0 text-muted" />
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
            <SpaceIcon icon={open.icon} name={open.name} size={open.icon ? 15 : 13} />
          </span>
          <span className="truncate">{open.name}</span>
        </button>
        {allowNew && !pickSpace && (
          <button
            type="button"
            aria-label={`New collection in ${open.name}`}
            onClick={() => setNaming((v) => !v)}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-primary"
          >
            <FolderPlus size={16} aria-hidden />
          </button>
        )}
      </div>
      {naming && !pickSpace && (
        <form
          className="mb-1 flex gap-2 px-1 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() !== '') onPick({ kind: 'new', spaceId: open.id, title: title.trim(), label: `${open.name} / ${title.trim()}` });
          }}
        >
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Collection name" className={`${inputClass} h-10`} />
          <button type="submit" disabled={title.trim() === ''} className="h-10 rounded-lg bg-primary px-3 text-sm font-bold text-primary-fg disabled:opacity-50">
            Create
          </button>
        </form>
      )}
      <ul aria-label={`Collections in ${open.name}`} className="flex flex-col gap-0.5">
        {pickSpace && (
          <li>
            <button
              type="button"
              className={`${row} text-primary`}
              onClick={() => onPick({ kind: 'new', spaceId: open.id, title: '', label: open.name })}
            >
              <FolderPlus size={16} aria-hidden /> Use “{open.name}”
            </button>
          </li>
        )}
        {!pickSpace &&
          inSpace.map((c) => {
            const isOpen = expanded.has(c.id);
            const saved = holdsCurrent(c.id);
            return (
              <li key={c.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label={isOpen ? `Hide tabs of ${c.title}` : `Show tabs of ${c.title}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpanded(c.id)}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
                  >
                    {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className={`${row} min-w-0 flex-1 pl-1`}
                    onClick={() => onPick({ kind: 'collection', collectionId: c.id, label: `${open.name} / ${c.title}` })}
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--border)' }} />
                    <span className="min-w-0 flex-1 truncate">
                      {c.title}
                      <span className="text-xs font-normal text-muted">{countOf(c.id)}</span>
                    </span>
                    {saved && <Check size={16} aria-label="This tab is already saved here" className="shrink-0 text-accent" />}
                  </button>
                </div>
                {isOpen && (
                  <ul aria-label={`Tabs in ${c.title}`} className="mb-1 ml-9 flex flex-col gap-1">
                    {(cardsByCollection?.get(c.id) ?? []).map((card) => (
                      <li key={card.id}>
                        <a
                          href={card.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-2.5 text-xs font-medium transition-colors duration-150 hover:bg-line"
                        >
                          <Favicon card={card} size={16} />
                          <span className="min-w-0 flex-1 truncate">{card.customTitle ?? card.title}</span>
                        </a>
                      </li>
                    ))}
                    {(cardsByCollection?.get(c.id) ?? []).length === 0 && <li className="px-2 py-1 text-xs text-muted">Empty.</li>}
                  </ul>
                )}
              </li>
            );
          })}
        {!pickSpace && inSpace.length === 0 && <li className="px-3 py-3 text-center text-sm text-muted">No collections in this space yet.</li>}
      </ul>
    </div>
  );
}
