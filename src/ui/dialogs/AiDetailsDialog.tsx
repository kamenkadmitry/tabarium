import { ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { CardDetails } from '../../core/ai/tasks';
import type { Card } from '../../core/types';
import { Dialog, PrimaryButton, SecondaryButton } from '../Dialog';

export interface ProposedDetails {
  card: Card;
  details: CardDetails;
}

interface Props {
  title: string;
  items: readonly ProposedDetails[];
  /** Links that were not sent (already labelled, or over the limit of one run). */
  skipped: number;
  /** `move` is true when the links should also go to their suggested collections. */
  onApply: (selected: readonly ProposedDetails[], move: boolean) => Promise<void>;
  onClose: () => void;
}

const hasContent = (d: CardDetails) => d.note !== '' || d.tags.length > 0 || d.hashtags.length > 0 || d.destination !== null;

/** Review what the AI proposes for links (note, a tag, hashtags, a collection) and apply the ones you want. */
export function AiDetailsDialog({ title, items, skipped, onApply, onClose }: Props) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(items.filter((i) => hasContent(i.details)).map((i) => i.card.id)));
  const [move, setMove] = useState(true);
  const [busy, setBusy] = useState(false);
  const selected = items.filter((i) => chosen.has(i.card.id));
  const anyDestination = items.some((i) => i.details.destination !== null);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        The AI saw only titles and addresses, and the tags, hashtags and collections you already have. It reuses them and proposes a new one only when nothing fits.
        Existing notes and labels are never replaced; suggestions are added. Untick what you do not want.
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
                          <span key={t}>
                            {t}
                            {details.newTags.includes(t) && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-bold uppercase text-muted">new</span>}
                          </span>
                        ))}
                        {details.hashtags.map((h) => (
                          <span key={h} className="text-primary">
                            #{h}
                            {details.newHashtags.includes(h) && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-bold uppercase text-muted">new</span>}
                          </span>
                        ))}
                      </span>
                      {details.destination && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                          <ArrowRight size={12} aria-hidden /> {details.destination.space} / {details.destination.collection}
                          {details.destination.isNew && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-bold uppercase">new</span>}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {anyDestination && (
        <label className="mb-3 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={move} onChange={() => setMove((v) => !v)} className="size-4 accent-[var(--primary)]" />
          Also move the links to the suggested collections
        </label>
      )}
      {skipped > 0 && <p className="mb-3 text-xs text-muted">{skipped} other links were left out: they already have labels, or this run was limited to 30 links.</p>}
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton
          type="button"
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(selected, move);
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
