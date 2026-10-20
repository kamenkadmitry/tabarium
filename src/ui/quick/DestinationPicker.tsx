import { ChevronLeft, ChevronRight, FolderPlus, Layers } from 'lucide-react';
import { useState } from 'react';
import type { Collection, Space } from '../../core/types';
import { inputClass } from '../Dialog';

export type Destination =
  | { kind: 'collection'; collectionId: string; label: string }
  | { kind: 'new'; spaceId: string; title: string; label: string };

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
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
export function DestinationPicker({ spaces, collections, query, allowNew = true, pickSpace = false, onPick }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? '';
  const q = query.trim().toLowerCase();

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
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
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
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-bold text-primary">
                  {s.name[0]?.toUpperCase()}
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
      <button
        type="button"
        onClick={() => {
          setOpenId(null);
          setNaming(false);
        }}
        className="mb-1 flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-surface-2"
      >
        <ChevronLeft size={16} aria-hidden /> {open.name}
      </button>
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
          inSpace.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={row}
                onClick={() => onPick({ kind: 'collection', collectionId: c.id, label: `${open.name} / ${c.title}` })}
              >
                <Layers size={16} aria-hidden className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
              </button>
            </li>
          ))}
        {!pickSpace && inSpace.length === 0 && <li className="px-3 py-3 text-center text-sm text-muted">No collections in this space yet.</li>}
        {allowNew && !pickSpace && (
          <li>
            {naming ? (
              <form
                className="flex gap-2 px-1 py-1"
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
            ) : (
              <button type="button" className={`${row} text-primary`} onClick={() => setNaming(true)}>
                <FolderPlus size={16} aria-hidden /> New collection…
              </button>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
