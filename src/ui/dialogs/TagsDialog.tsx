import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Collection, Tag } from '../../core/types';
import { SWATCHES } from '../colors';
import { Dialog, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';

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
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0].value);
  const assigned = new Set(collection?.tagIds ?? []);

  return (
    <Dialog title={collection ? `Tags for “${collection.title}”` : 'Manage tags'} onClose={onClose}>
      <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {tags.map((t) => (
          <li key={t.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
            {collection && (
              <input
                type="checkbox"
                aria-label={`Use tag ${t.title}`}
                checked={assigned.has(t.id)}
                onChange={() => {
                  const next = new Set(assigned);
                  if (next.has(t.id)) next.delete(t.id);
                  else next.add(t.id);
                  void onAssign(collection.id, [...next]);
                }}
                className="size-4 accent-[var(--primary)]"
              />
            )}
            <span aria-hidden className="size-3 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 text-sm font-medium">{t.title}</span>
            <button
              type="button"
              aria-label={`Delete tag ${t.title}`}
              onClick={() => void onDelete(t.id)}
              className="grid size-8 place-items-center rounded-md text-muted hover:text-danger"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
        {tags.length === 0 && <li className="py-3 text-center text-sm text-muted">No tags yet.</li>}
      </ul>

      <form
        className="border-t border-line pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onCreate(title.trim(), color);
          setTitle('');
        }}
      >
        <p className="mb-2 text-sm font-semibold">New tag</p>
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tag name" className={inputClass} />
          <PrimaryButton disabled={title.trim() === ''}>Add</PrimaryButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Tag colour">
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={color === s.value}
              aria-label={s.name}
              onClick={() => setColor(s.value)}
              className="size-7 rounded-full border-2 border-transparent aria-checked:border-fg"
              style={{ background: s.value }}
            />
          ))}
        </div>
      </form>
      <div className="mt-5 flex justify-end">
        <SecondaryButton onClick={onClose}>Done</SecondaryButton>
      </div>
    </Dialog>
  );
}
