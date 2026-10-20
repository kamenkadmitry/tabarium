import { useState } from 'react';
import type { Collection, Space } from '../../core/types';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';

const NEW = '__new__';

interface Props {
  count: number;
  spaces: readonly Space[];
  collections: readonly Collection[];
  /** Space that receives a newly created collection. */
  newCollectionSpaceId: string | undefined;
  onSubmit: (target: { collectionId: string } | { newTitle: string }) => Promise<void>;
  onClose: () => void;
}

export function AddToCollectionDialog({ count, spaces, collections, newCollectionSpaceId, onSubmit, onClose }: Props) {
  const canCreate = newCollectionSpaceId !== undefined;
  const [target, setTarget] = useState(canCreate ? NEW : (collections[0]?.id ?? ''));
  const [newTitle, setNewTitle] = useState(`Saved ${new Date().toLocaleDateString()}`);
  const [busy, setBusy] = useState(false);
  const valid = target === NEW ? newTitle.trim() !== '' : target !== '';

  return (
    <Dialog title={`Add ${count} tab${count === 1 ? '' : 's'} to a collection`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(target === NEW ? { newTitle: newTitle.trim() } : { collectionId: target });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Collection">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
            {canCreate && <option value={NEW}>New collection…</option>}
            {spaces.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {collections
                  .filter((c) => c.spaceId === s.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {target === NEW && (
          <Field label="New collection name">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={!valid || busy}>Add</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
