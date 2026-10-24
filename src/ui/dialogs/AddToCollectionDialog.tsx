import { useState } from 'react';
import type { Collection, Space } from '../../core/types';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { useT } from '../../i18n/I18nProvider';
import { displayCollectionName, displaySpaceName } from '../../core/quicksave';

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
  const t = useT();
  const canCreate = newCollectionSpaceId !== undefined;
  const [target, setTarget] = useState(canCreate ? NEW : (collections[0]?.id ?? ''));
  const [newTitle, setNewTitle] = useState(t('common.savedDate', { date: t.date(new Date()) }));
  const [busy, setBusy] = useState(false);
  const valid = target === NEW ? newTitle.trim() !== '' : target !== '';

  return (
    <Dialog title={t.plural('dlg.addTo.title', count)} onClose={onClose}>
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
        <Field label={t('dlg.addTo.collection')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
            {canCreate && <option value={NEW}>{t('dlg.addTo.newCollection')}</option>}
            {spaces.map((s) => (
              <optgroup key={s.id} label={displaySpaceName(s)}>
                {collections
                  .filter((c) => c.spaceId === s.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {displayCollectionName(s, c)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {target === NEW && (
          <Field label={t('dlg.addTo.newName')}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>{t('common.cancel')}</SecondaryButton>
          <PrimaryButton disabled={!valid || busy}>{t('dlg.addTo.add')}</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
