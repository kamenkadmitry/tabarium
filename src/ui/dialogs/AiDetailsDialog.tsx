import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { CardDetails } from '../../core/ai/tasks';
import type { Card } from '../../core/types';
import { Dialog, PrimaryButton, SecondaryButton } from '../Dialog';

export interface ProposedDetails {
  card: Card;
  details: CardDetails;
}

interface Props {
  collectionTitle: string;
  items: readonly ProposedDetails[];
  /** Links of the collection that were not sent because they already have tags or hashtags, or the limit was reached. */
  skipped: number;
  onApply: (selected: readonly ProposedDetails[]) => Promise<void>;
  onClose: () => void;
}

const hasContent = (d: CardDetails) => d.note !== '' || d.tags.length > 0 || d.hashtags.length > 0;

/** Review the AI's proposals for the links of a collection and apply the ones you want. */
export function AiDetailsDialog({ collectionTitle, items, skipped, onApply, onClose }: Props) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(items.filter((i) => hasContent(i.details)).map((i) => i.card.id)));
  const [busy, setBusy] = useState(false);
  const selected = items.filter((i) => chosen.has(i.card.id));

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog title={`Suggested details for “${collectionTitle}”`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        The AI saw only titles and addresses. Existing notes and labels are never replaced; suggestions are added. Untick what you do not want.
      </p>
      <ul aria-label="Suggestions" className="mb-3 flex max-h-96 flex-col gap-1 overflow-y-auto">
        {items.map(({ card, details }) => {
          const empty = !hasContent(details);
          return (
            <li key={card.id} className={`rounded-lg border border-line p-3 ${empty ? 'opacity-60' : ''}`}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={chosen.has(card.id)}
                  disabled={empty}
                  onChange={() => toggle(card.id)}
                  aria-label={`Apply to ${card.customTitle ?? card.title}`}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{card.customTitle ?? card.title}</span>
                  {empty ? (
                    <span className="block text-xs text-muted">Nothing suggested.</span>
                  ) : (
                    <>
                      {details.note !== '' && <span className="block text-sm">{details.note}</span>}
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                        {details.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                        {details.hashtags.map((h) => (
                          <span key={h} className="text-primary">
                            #{h}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {skipped > 0 && <p className="mb-3 text-xs text-muted">{skipped} other links were left out: they already have labels, or this run was limited to 30 links.</p>}
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          type="button"
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(selected);
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles size={15} aria-hidden /> Apply to {selected.length}
        </PrimaryButton>
      </div>
    </Dialog>
  );
}
