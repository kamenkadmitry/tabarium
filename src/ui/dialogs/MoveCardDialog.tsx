import { useState } from 'react';
import type { Collection, Space } from '../../core/types';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  currentCollectionId: string;
  onSubmit: (collectionId: string) => Promise<void>;
  onClose: () => void;
}

/** Keyboard- and screen-reader-friendly alternative to dragging a tab into another collection. */
export function MoveCardDialog({ spaces, collections, currentCollectionId, onSubmit, onClose }: Props) {
  const targets = collections.filter((c) => c.id !== currentCollectionId);
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Dialog title="Move tab" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(target);
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Move to collection">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
            {spaces.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {targets
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
        {targets.length === 0 && <p className="mb-4 text-sm text-muted">Create another collection first.</p>}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={target === '' || busy}>Move</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
