import { useState } from 'react';
import type { Collection, Space } from '../../core/types';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { useT } from '../../i18n/I18nProvider';
import { displayCollectionName, displaySpaceName } from '../../core/quicksave';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  /** Collection to leave out of the list; null when links from several collections are moved. */
  currentCollectionId: string | null;
  /** More than one link is moved. */
  count?: number;
  onSubmit: (collectionId: string) => Promise<void>;
  onClose: () => void;
}

/** Keyboard- and screen-reader-friendly alternative to dragging a tab into another collection. */
export function MoveCardDialog({ spaces, collections, currentCollectionId, count = 1, onSubmit, onClose }: Props) {
  const t = useT();
  const targets = collections.filter((c) => c.id !== currentCollectionId);
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Dialog title={count > 1 ? t.plural('dlg.move.title', count) : t('dlg.move.titleOne')} onClose={onClose}>
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
        <Field label={t('dlg.move.to')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
            {spaces.map((s) => (
              <optgroup key={s.id} label={displaySpaceName(s)}>
                {targets
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
        {targets.length === 0 && <p className="mb-4 text-sm text-muted">{t('dlg.move.none')}</p>}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>{t('common.cancel')}</SecondaryButton>
          <PrimaryButton disabled={target === '' || busy}>{t('dlg.move.move')}</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
