import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Collection, Tag } from '../../core/types';
import { SWATCHES } from '../colors';
import { Dialog, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { useT } from '../../i18n/I18nProvider';

interface Props {
  tags: readonly Tag[];
  /** When set, checkboxes assign tags to this collection. Otherwise the dialog only manages tags. */
  collection?: Collection;
  onCreate: (title: string, color: string) => Promise<void>;
  onDelete: (tagId: string) => Promise<void>;
  onAssign: (collectionId: string, tagIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function TagsDialog({ tags, collection, onCreate, onDelete, onAssign, onClose }: Props) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0].value);
  const assigned = new Set(collection?.tagIds ?? []);

  return (
    <Dialog title={collection ? t('dlg.tags.title', { title: collection.title }) : t('dlg.tags.manage')} onClose={onClose}>
      <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {tags.map((tag) => (
          <li key={tag.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
            {collection && (
              <input
                type="checkbox"
                aria-label={t('dlg.tags.use', { title: tag.title })}
                checked={assigned.has(tag.id)}
                onChange={() => {
                  const next = new Set(assigned);
                  if (next.has(tag.id)) next.delete(tag.id);
                  else next.add(tag.id);
                  void onAssign(collection.id, [...next]);
                }}
                className="size-4 accent-[var(--primary)]"
              />
            )}
            <span aria-hidden className="size-3 rounded-full" style={{ background: tag.color }} />
            <span className="flex-1 text-sm font-medium">{tag.title}</span>
            <button
              type="button"
              aria-label={t('dlg.tags.delete', { title: tag.title })}
              onClick={() => void onDelete(tag.id)}
              className="grid size-8 place-items-center rounded-md text-muted hover:text-danger"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
        {tags.length === 0 && <li className="py-3 text-center text-sm text-muted">{t('dlg.tags.empty')}</li>}
      </ul>

      <form
        className="border-t border-line pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onCreate(title.trim(), color);
          setTitle('');
        }}
      >
        <p className="mb-2 text-sm font-semibold">{t('dlg.tags.new')}</p>
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('dlg.tags.name')} className={inputClass} />
          <PrimaryButton disabled={title.trim() === ''}>{t('common.add')}</PrimaryButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('dlg.tags.colour')}>
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={color === s.value}
              aria-label={t(s.key)}
              onClick={() => setColor(s.value)}
              className="size-7 rounded-full border-2 border-transparent aria-checked:border-fg"
              style={{ background: s.value }}
            />
          ))}
        </div>
      </form>
      <div className="mt-5 flex justify-end">
        <SecondaryButton onClick={onClose}>{t('dlg.tags.done')}</SecondaryButton>
      </div>
    </Dialog>
  );
}
