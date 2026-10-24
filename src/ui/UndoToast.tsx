import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Deletion } from '../core/undo';
import { useT } from '../i18n/I18nProvider';
import type { T } from '../i18n/messages';

/** How long the undo toast stays up before the delete becomes final. */
const TOAST_MS = 8000;

function label(t: T, d: Deletion): string {
  switch (d.kind) {
    case 'cards':
      return d.cards.length === 1 ? t('undo.link') : t.plural('undo.links', d.cards.length);
    case 'collection':
      return t('undo.collection');
    case 'space':
      return t('undo.space');
    case 'tag':
      return t('undo.tag');
    case 'tags':
      return t.plural('undo.tags', d.tags.length);
    case 'hashtag':
      return t('undo.hashtag');
    case 'hashtags':
      return t.plural('undo.hashtags', d.hashtags.length);
  }
}

interface Props {
  deletion: Deletion | null;
  onUndo: (deletion: Deletion) => void;
  onDismiss: () => void;
}

/** The "Deleted. Undo" toast shown after a delete; closing it (or waiting it out) makes the delete final. */
export function UndoToast({ deletion, onUndo, onDismiss }: Props) {
  const t = useT();
  // Kept in a ref so a fresh onDismiss closure never restarts the countdown.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  const ref = useRef<HTMLDivElement>(null);
  // A manual popover lands in the top layer: the toast stays usable while a modal dialog is open.
  // The div only exists once a deletion arrives, so opening is keyed to it; the guard keeps repeat opens from throwing.
  // When the "New collection" button is on screen the toast anchors 50px to its left and tracks it on scroll/resize;
  // position-area only ever applies while that anchor exists, otherwise the toast falls back to top-center.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = el.style;
    for (const prop of ['position-anchor', 'position-area', 'justify-self', 'align-self', 'margin-right', 'left', 'top', 'translate', 'transform']) s.removeProperty(prop);
    if (document.querySelector('.anchor-undo')) {
      s.setProperty('position-anchor', '--undo-anchor');
      s.setProperty('position-area', 'left');
      s.setProperty('justify-self', 'end');
      s.setProperty('align-self', 'anchor-center');
      s.setProperty('margin-right', '50px');
      s.setProperty('left', 'auto');
      s.setProperty('top', 'auto');
      s.setProperty('translate', 'none');
      s.setProperty('transform', 'none');
    }
    if (!el.matches(':popover-open')) el.showPopover();
  }, [deletion]);
  // A new deletion restarts the countdown; resetting during render keeps the effect free of sync setState.
  const [lastDeletion, setLastDeletion] = useState(deletion);
  const [left, setLeft] = useState(TOAST_MS);
  if (deletion !== lastDeletion) {
    setLastDeletion(deletion);
    setLeft(TOAST_MS);
  }
  useEffect(() => {
    if (!deletion) return;
    const started = Date.now();
    const tick = setInterval(() => setLeft(Math.max(0, TOAST_MS - (Date.now() - started))), 100);
    const timer = setTimeout(() => dismissRef.current(), TOAST_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [deletion]);

  if (!deletion) return null;
  return (
    <div ref={ref} popover="manual" role="status" className="fixed left-1/2 top-4 m-0 flex -translate-x-1/2 items-center gap-4 overflow-hidden whitespace-nowrap rounded-xl bg-accent px-6 py-3 text-accent-fg shadow-lg">
      <span className="text-sm font-bold">{label(t, deletion)}</span>
      <span aria-hidden className="text-sm font-bold tabular-nums opacity-80">
        {Math.ceil(left / 1000)}s
      </span>
      <button
        type="button"
        onClick={() => onUndo(deletion)}
        className="rounded-md bg-white/25 px-3 py-1 text-sm font-bold transition-colors duration-150 hover:bg-white/35"
      >
        {t('common.undo')}
      </button>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={onDismiss}
        className="grid size-7 place-items-center rounded-md transition-colors duration-150 hover:bg-white/25"
      >
        <X size={15} aria-hidden />
      </button>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/40" style={{ transform: `scaleX(${left / TOAST_MS})` }} />
    </div>
  );
}
