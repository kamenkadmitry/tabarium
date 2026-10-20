import { Layers } from 'lucide-react';
import { useState } from 'react';
import type { Card, Collection, Tag } from '../core/types';
import { CollectionCard, type CollectionActions } from './CollectionCard';
import { endDrag, getDragPayload } from './dnd';

interface Props {
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, Card[]>;
  tags: readonly Tag[];
  /** Tags used by collections of this space, offered as filters. */
  spaceTags: readonly Tag[];
  tagFilter: string | null;
  onTagFilter: (tagId: string | null) => void;
  collectionActions: (collection: Collection, cards: readonly Card[]) => CollectionActions;
  /** Browser tabs were dropped on empty board space: create a new collection from them. */
  onDropTabsAsCollection: (tabIds: number[]) => void;
}

/** Collections of one space plus the drop zone that turns dragged browser tabs into a new collection. */
export function SpaceBoard(props: Props) {
  const [over, setOver] = useState(false);
  const empty = props.collections.length === 0;

  const zone = {
    onDragOver: (e: React.DragEvent) => {
      if (getDragPayload()?.type === 'tabs') {
        e.preventDefault();
        setOver(true);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const payload = endDrag();
      if (payload?.type === 'tabs') props.onDropTabsAsCollection(payload.tabIds);
    },
  };

  return (
    <>
      {props.spaceTags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tag">
          {props.spaceTags.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={props.tagFilter === t.id}
              onClick={() => props.onTagFilter(props.tagFilter === t.id ? null : t.id)}
              className="flex h-8 items-center gap-2 rounded-full border border-line px-3 text-xs font-semibold aria-pressed:border-primary aria-pressed:bg-surface-2"
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
              {t.title}
            </button>
          ))}
        </div>
      )}

      {!empty && (
        <div className="columns-1 gap-5 space-y-5 md:columns-2 xl:columns-3">
          {props.collections.map((col) => {
            const list = props.cardsByCollection.get(col.id) ?? [];
            return (
              <CollectionCard
                key={col.id}
                collection={col}
                cards={list}
                tags={props.tags.filter((t) => col.tagIds.includes(t.id))}
                actions={props.collectionActions(col, list)}
              />
            );
          })}
        </div>
      )}

      <div
        {...zone}
        aria-label="Drop tabs here to create a collection"
        className={`mt-5 grid place-items-center rounded-2xl border-2 border-dashed px-6 text-center transition-colors duration-150 ${
          empty ? 'min-h-72' : 'min-h-24'
        } ${over ? 'border-primary bg-surface-2' : 'border-line'}`}
      >
        {empty ? (
          <div>
            <Layers size={34} aria-hidden className="mx-auto text-muted" />
            <p className="mt-3 font-bold">No collections yet</p>
            <p className="mt-1 text-sm text-muted">Drag a tab here, or save tabs, to create your first collection.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Drop tabs here to create a new collection</p>
        )}
      </div>
    </>
  );
}
