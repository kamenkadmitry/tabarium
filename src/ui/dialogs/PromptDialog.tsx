import { useState } from 'react';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';

interface Props {
  title: string;
  label: string;
  submitLabel: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}

/** Single-text-field dialog used for creating and renaming spaces and collections. */
export function PromptDialog({ title, label, submitLabel, initialValue = '', onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(trimmed);
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={label}>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={trimmed === '' || busy}>{submitLabel}</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
