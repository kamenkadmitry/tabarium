import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Dialog, SecondaryButton } from '../Dialog';

interface Props {
  suggestions: readonly string[];
  onPick: (name: string) => Promise<void>;
  onClose: () => void;
}

export function AiNamesDialog({ suggestions, onPick, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Suggested names" onClose={onClose}>
      <ul className="mb-5 flex flex-col gap-2">
        {suggestions.map((name) => (
          <li key={name}>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onPick(name);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-line px-4 text-left text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden className="text-accent" /> {name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <SecondaryButton onClick={onClose}>Keep current name</SecondaryButton>
      </div>
    </Dialog>
  );
}
