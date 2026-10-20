import { useState } from 'react';
import type { Card } from '../../core/types';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { LabelFields, type LabelsApi } from '../labels';
import { parseUserUrl } from './AddLinkDialog';

interface Props {
  card: Card;
  labels: LabelsApi;
  onSubmit: (patch: { customTitle: string | null; url: string; note: string | null; tagIds: string[]; hashtagIds: string[] }) => Promise<void>;
  onClose: () => void;
}

export function CardDialog({ card, labels, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(card.customTitle ?? card.title);
  const [rawUrl, setRawUrl] = useState(card.url);
  const [note, setNote] = useState(card.note ?? '');
  const [busy, setBusy] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([...card.tagIds]);
  const [hashtagIds, setHashtagIds] = useState<string[]>([...card.hashtagIds]);
  const url = parseUserUrl(rawUrl);

  return (
    <Dialog title="Edit tab" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (url === null) return;
          setBusy(true);
          try {
            const trimmed = title.trim();
            await onSubmit({
              customTitle: trimmed === '' || trimmed === card.title ? null : trimmed,
              url,
              note: note.trim() === '' ? null : note,
              tagIds,
              hashtagIds,
            });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Address">
          <input value={rawUrl} onChange={(e) => setRawUrl(e.target.value)} aria-invalid={url === null} className={inputClass} />
          {url === null && <span className="mt-1 block text-xs text-danger">Enter a valid http(s) address.</span>}
        </Field>
        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
          />
        </Field>
        <LabelFields api={labels} tagIds={tagIds} hashtagIds={hashtagIds} onTags={setTagIds} onHashtags={setHashtagIds} />
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={url === null || busy}>Save</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
