import { Layers } from 'lucide-react';
import { useState } from 'react';
import type { BoardView } from '../core/boardTypes';
import type { Card, Collection, Tag } from '../core/types';
import { CollectionCard, type CollectionActions } from './CollectionCard';
import { endDrag, getDragPayload, hasExternalLinks, LINKS_MIME } from './dnd';
import type { CardSelection } from './useCardSelection';

interface Props {
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, Card[]>;
  tags: readonly Tag[];
  view: BoardView;
  /** Manual reordering is available only while the board uses "Custom order". */
  reorderable: boolean;
  /** True when a filter hides some of the space's collections. */
  filtered: boolean;
  collectionActions: (collection: Collection, cards: readonly Card[]) => CollectionActions;
  selection: CardSelection;
  /** Inline editor: which collection and card it is open on, and how to draw it. */
  editor: { collectionId: string | null; cardId: string | null; render: (collection: Collection, card: Card | null) => React.ReactNode };
  /** Browser tabs were dropped on empty board space: create a new collection from them. */
  onDropTabsAsCollection: (tabIds: number[]) => void;
  /** Links dragged from the side panel (raw `dataTransfer` text) were dropped on empty board space. */
  onDropLinksAsCollection: (raw: string) => void;
}

// Columns have a minimum width instead of a fixed count: a collection header needs about 19rem for its
// title, counter and buttons, and the Open tabs panel can take a lot of the page.
const LAYOUT: Record<BoardView, string> = {
  grid: 'columns-[19rem] gap-5 space-y-5',
  compact: 'columns-[16rem] gap-4 space-y-4',
  card: 'grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-5',
  list: 'flex flex-col gap-3',
};

/** Collections of one space plus the drop zone that turns dragged browser tabs into a new collection. */
export function SpaceBoard(props: Props) {
  const [over, setOver] = useState(false);
  const empty = props.collections.length === 0;

  const zone = {
    onDragOver: (e: React.DragEvent) => {
      if (getDragPayload()?.type === 'tabs' || hasExternalLinks(e)) {
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
      else if (!payload && hasExternalLinks(e)) props.onDropLinksAsCollection(e.dataTransfer.getData(LINKS_MIME));
    },
  };

  return (
    <>
      {!empty && (
        <div className={LAYOUT[props.view]}>
          {props.collections.map((col) => {
            const list = props.cardsByCollection.get(col.id) ?? [];
            return (
              <CollectionCard
                key={col.id}
                collection={col}
                cards={list}
                tags={props.tags.filter((t) => col.tagIds.includes(t.id))}
                actions={props.collectionActions(col, list)}
                view={props.view}
                reorderable={props.reorderable}
                selection={props.selection}
                editor={{
                  cardId: props.editor.collectionId === col.id ? props.editor.cardId : null,
                  adding: props.editor.collectionId === col.id && props.editor.cardId === null,
                  render: (card) => props.editor.render(col, card),
                }}
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
        {empty && props.filtered ? (
          <p className="text-sm text-muted">No collection matches the current filter.</p>
        ) : empty ? (
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
