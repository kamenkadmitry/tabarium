import { ArrowRightLeft, Inbox, Star, Tag, Trash2, X } from 'lucide-react';

interface Props {
  count: number;
  /** Every selected link is starred, so the star button takes the stars away. */
  allStarred: boolean;
  onClear: () => void;
  onMove: () => void;
  onLabels: () => void;
  onInbox: () => void;
  onStar: () => void;
  onDelete: () => void;
}

const button =
  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2';

/** Actions for the links ticked on the board. Appears under the board while anything is selected. */
export function BulkBar({ count, allStarred, onClear, onMove, onLabels, onInbox, onStar, onDelete }: Props) {
  return (
    <div role="region" aria-label="Selected links" className="flex flex-wrap items-center gap-1 border-t border-line bg-surface px-6 py-2">
      <button type="button" aria-label="Clear selection" onClick={onClear} className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
        <X size={16} aria-hidden />
      </button>
      <span className="mr-2 text-sm font-bold">{count} selected</span>
      <button type="button" onClick={onMove} className={button}>
        <ArrowRightLeft size={15} aria-hidden /> Move
      </button>
      <button type="button" onClick={onLabels} className={button}>
        <Tag size={15} aria-hidden /> Tags and hashtags
      </button>
      <button type="button" onClick={onInbox} className={button}>
        <Inbox size={15} aria-hidden /> Inbox
      </button>
      <button type="button" onClick={onStar} className={button}>
        <Star size={15} aria-hidden fill={allStarred ? 'currentColor' : 'none'} /> {allStarred ? 'Unstar' : 'Star'}
      </button>
      <button type="button" onClick={onDelete} className={`${button} ml-auto text-danger`}>
        <Trash2 size={15} aria-hidden /> Delete
      </button>
    </div>
  );
}
