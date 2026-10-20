import { useState } from 'react';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { LabelFields, type LabelsApi } from '../labels';

interface Props {
  collectionTitle: string;
  labels: LabelsApi;
  onSubmit: (link: { url: string; title: string; tagIds: string[]; hashtagIds: string[] }) => Promise<void>;
  onClose: () => void;
}

/** Normalises user input like "example.com" into a full https URL; returns null if it is not a valid web URL. */
export function parseUserUrl(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function AddLinkDialog({ collectionTitle, labels, onSubmit, onClose }: Props) {
  const [rawUrl, setRawUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [hashtagIds, setHashtagIds] = useState<string[]>([]);
  const url = parseUserUrl(rawUrl);
  const showError = rawUrl.trim() !== '' && url === null;

  return (
    <Dialog title={`Add link to “${collectionTitle}”`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (url === null) return;
          setBusy(true);
          try {
            await onSubmit({ url, title: title.trim() || new URL(url).hostname, tagIds, hashtagIds });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Address">
          <input
            autoFocus
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            placeholder="example.com/article"
            aria-invalid={showError}
            className={inputClass}
          />
          {showError && <span className="mt-1 block text-xs text-danger">Enter a valid http(s) address.</span>}
        </Field>
        <Field label="Title" hint="Optional. Defaults to the site name.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <LabelFields api={labels} tagIds={tagIds} hashtagIds={hashtagIds} onTags={setTagIds} onHashtags={setHashtagIds} />
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={url === null || busy}>Add link</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
