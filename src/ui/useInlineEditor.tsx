import { useCallback, useRef, useState } from 'react';
import { repo } from '../core/instance';
import type { CardDetails } from '../core/ai/tasks';
import type { Card, Collection } from '../core/types';
import type { LabelsApi } from './labels';
import { LinkEditor } from './LinkEditor';
import { cardPatch, type LinkValues } from './linkInput';

interface Open {
  collectionId: string;
  /** The link being edited; null while adding a new one at the end of the collection. */
  cardId: string | null;
}

interface Deps {
  reportError: (what: string, e: unknown) => void;
  clearError: () => void;
}

const BLANK: LinkValues = { title: '', url: '', note: '', tagIds: [], hashtagIds: [] };

/**
 * The editor that opens under a link (or at the end of a collection) on the board. Only one is open at a time;
 * opening another one while something is typed asks before it is thrown away.
 */
export function useInlineEditor({ reportError, clearError }: Deps) {
  const [open, setOpen] = useState<Open | null>(null);
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const close = useCallback(() => {
    dirty.current = false;
    setOpen(null);
  }, []);

  const show = (next: Open) => {
    if (dirty.current && !confirm('Discard your changes?')) return;
    dirty.current = false;
    setOpen(next);
  };

  const saveEdit = async (card: Card, values: LinkValues): Promise<boolean> => {
    try {
      clearError();
      await repo.saveCard(card.id, cardPatch(card, values), { tagIds: values.tagIds, hashtagIds: values.hashtagIds });
      close();
      return true;
    } catch (e) {
      reportError('Saving tab', e);
      return false;
    }
  };

  const saveNew = async (collectionId: string, values: LinkValues): Promise<boolean> => {
    try {
      clearError();
      const added = await repo.addCards(collectionId, [
        {
          title: values.title.trim() || new URL(values.url).hostname,
          url: values.url,
          note: values.note.trim() === '' ? null : values.note,
          tagIds: values.tagIds,
          hashtagIds: values.hashtagIds,
        },
      ]);
      if (added.length === 0) throw new Error('This address is already in the collection.');
      close();
      return true;
    } catch (e) {
      reportError('Adding link', e);
      return false;
    }
  };

  return {
    openEdit: (card: Card) => show({ collectionId: card.collectionId, cardId: card.id }),
    openAdd: (collectionId: string) => show({ collectionId, cardId: null }),
    close,
    saveEdit,
    /** What the board needs to draw the editor in the right place. */
    slot: (labels: LabelsApi, layout: 'stack' | 'columns', suggest?: (input: { title: string; url: string }) => Promise<CardDetails>) => ({
      collectionId: open?.collectionId ?? null,
      cardId: open?.cardId ?? null,
      render: (collection: Collection, card: Card | null) => (
        <LinkEditor
          key={card?.id ?? `new-${collection.id}`}
          mode={card ? 'edit' : 'add'}
          layout={layout}
          labels={labels}
          suggest={suggest}
          initial={
            card
              ? { title: card.customTitle ?? card.title, url: card.url, note: card.note ?? '', tagIds: card.tagIds, hashtagIds: card.hashtagIds }
              : BLANK
          }
          onSubmit={(values) => (card ? saveEdit(card, values) : saveNew(collection.id, values))}
          onCancel={close}
          onDirtyChange={setDirty}
        />
      ),
    }),
  };
}
