import { CornerDownLeft, Folder, Hash, Kanban, Layers, Tag } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Card, Collection, Hashtag, Space, Tag as TagType } from '../core/types';
import { displayCollectionName, displaySpaceName } from '../core/quicksave';
import { useT } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/messages';
import { Favicon } from './CardRow';
import { cardSearchText } from './searchModel';
import type { View } from './Sidebar';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cards: readonly Card[];
  tags: readonly TagType[];
  hashtags: readonly Hashtag[];
  onClose: () => void;
  /** Opens the link in a new foreground tab. */
  onOpenLink: (card: Card) => void;
  /** Jumps to the collection on its space board (navigates, expands and scrolls to it). */
  onGoCollection: (collection: Collection) => void;
  onNavigate: (view: View) => void;
}

interface Entry {
  /** A pal.group.* message key; translated once per render when the groups are built. */
  group: StringKey;
  icon: React.ReactNode;
  title: string;
  /** Right-side context, e.g. "Space / Collection" for a link. */
  hint?: string;
  run: () => void;
}

/** App views the palette can jump to; the same nav.* keys the header's TITLE_KEYS map uses. */
const PAGES: { titleKey: StringKey; view: View }[] = [
  { titleKey: 'nav.dashboard', view: { kind: 'dashboard' } },
  { titleKey: 'nav.starred', view: { kind: 'starred' } },
  { titleKey: 'nav.duplicates', view: { kind: 'duplicates' } },
  { titleKey: 'nav.bookmarksPage', view: { kind: 'bookmarks' } },
  { titleKey: 'nav.tags', view: { kind: 'tags' } },
  { titleKey: 'nav.hashtags', view: { kind: 'hashtags' } },
  { titleKey: 'nav.organizerTitle', view: { kind: 'organizer' } },
  { titleKey: 'nav.sessions', view: { kind: 'sessions' } },
  { titleKey: 'nav.settings', view: { kind: 'settings' } },
];

const MAX = { links: 8, collections: 6, spaces: 5, labels: 5 } as const;

/**
 * The Ctrl/Cmd+K jump palette: one combobox over the whole library — links, collections, spaces,
 * labels and app views. A query starting with '#' searches hashtags only, like the main search.
 */
export function CommandPalette({ spaces, collections, cards, tags, hashtags, onClose, onOpenLink, onGoCollection, onNavigate }: Props) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  /** The highlight position, remembered per query text so a query change resets it to the top. */
  const [sel, setSel] = useState({ q: '', index: 0 });

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const q = query.trim().toLowerCase();

  const entries = useMemo<Entry[]>(() => {
    const pageEntries = (list: typeof PAGES): Entry[] =>
      list.map((p) => ({ group: 'pal.group.pages', icon: <Kanban size={16} aria-hidden />, title: t(p.titleKey), run: () => onNavigate(p.view) }));
    const spaceEntries = (list: readonly Space[]): Entry[] =>
      list.map((s) => ({ group: 'pal.group.spaces', icon: <Layers size={16} aria-hidden />, title: displaySpaceName(s), run: () => onNavigate({ kind: 'space', spaceId: s.id }) }));
    const hashtagEntries = (list: readonly Hashtag[]): Entry[] =>
      list.map((h) => ({ group: 'pal.group.hashtags', icon: <Hash size={16} aria-hidden />, title: `#${h.name}`, run: () => onNavigate({ kind: 'hashtags' }) }));

    // '#' restricts the search to hashtags only, matching the main search bar's convention.
    if (q.startsWith('#')) return hashtagEntries(hashtags.filter((h) => h.name.includes(q.slice(1))).slice(0, MAX.labels));
    if (q === '') return [...pageEntries(PAGES), ...spaceEntries(spaces)];

    const linkEntries: Entry[] = cards
      .filter((c) => cardSearchText(c, tags, hashtags).includes(q))
      .slice(0, MAX.links)
      .map((c) => {
        const col = collectionById.get(c.collectionId);
        const space = col ? spaceById.get(col.spaceId) : undefined;
        return {
          group: 'pal.group.links',
          icon: <Favicon card={c} size={16} />,
          title: c.customTitle ?? c.title,
          hint: col && space ? `${displaySpaceName(space)} / ${displayCollectionName(space, col)}` : col?.title,
          run: () => onOpenLink(c),
        };
      });
    const collectionEntries: Entry[] = collections
      .filter((c) => displayCollectionName(spaceById.get(c.spaceId), c).toLowerCase().includes(q))
      .slice(0, MAX.collections)
      .map((c) => {
        const space = spaceById.get(c.spaceId);
        return {
          group: 'pal.group.collections',
          icon: <Folder size={16} aria-hidden />,
          title: displayCollectionName(space, c),
          hint: space ? displaySpaceName(space) : undefined,
          run: () => onGoCollection(c),
        };
      });
    const tagEntries: Entry[] = tags
      .filter((tag) => tag.title.toLowerCase().includes(q))
      .slice(0, MAX.labels)
      .map((tag) => ({ group: 'pal.group.tags', icon: <Tag size={16} aria-hidden />, title: tag.title, run: () => onNavigate({ kind: 'tags' }) }));

    return [
      ...linkEntries,
      ...collectionEntries,
      ...spaceEntries(spaces.filter((s) => displaySpaceName(s).toLowerCase().includes(q)).slice(0, MAX.spaces)),
      ...tagEntries,
      ...hashtagEntries(hashtags.filter((h) => h.name.includes(q)).slice(0, MAX.labels)),
      ...pageEntries(PAGES.filter((p) => t(p.titleKey).toLowerCase().includes(q))),
    ];
  }, [q, cards, collections, spaces, tags, hashtags, collectionById, spaceById, onOpenLink, onGoCollection, onNavigate, t]);

  // Groups keep their visual order; the flat list is what the arrows walk.
  const groups = useMemo(() => {
    const out: { label: StringKey; items: { entry: Entry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
      const last = out[out.length - 1];
      if (last && last.label === entry.group) last.items.push({ entry, index });
      else out.push({ label: entry.group, items: [{ entry, index }] });
    });
    return out;
  }, [entries]);

  // Live data can shrink the list under the cursor; the highlight clamps to what exists.
  const activeIndex = sel.q === q && entries.length > 0 ? Math.min(sel.index, entries.length - 1) : 0;
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length > 0) setSel({ q, index: (activeIndex + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[activeIndex]?.run();
    }
  };

  return (
    <dialog
      ref={ref}
      data-command-palette
      aria-labelledby={`${listId}-title`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="mx-auto mt-[12vh] w-[min(38rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-none backdrop:bg-black/50"
    >
      <h2 id={`${listId}-title`} className="sr-only">
        {t('pal.title')}
      </h2>
      <div className="border-b border-line p-3">
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={entries.length > 0 ? `${listId}-${activeIndex}` : undefined}
          aria-label={t('pal.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('pal.placeholder')}
          className="h-10 w-full rounded-lg bg-bg px-3 text-sm placeholder:text-muted"
        />
      </div>
      {/* Announces result counts to screen readers as the query changes. */}
      <p role="status" className="sr-only">
        {q === '' ? '' : t.plural('pal.count', entries.length)}
      </p>
      <ul id={listId} role="listbox" aria-label={t('pal.results')} className="max-h-[55vh] overflow-y-auto p-2">
        {groups.map((g) => (
          <li key={g.label} role="presentation">
            <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">{t(g.label)}</div>
            <ul role="group" aria-label={t(g.label)}>
              {g.items.map(({ entry, index }) => (
                <li
                  key={index}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSel({ q, index })}
                  onClick={() => entry.run()}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${index === activeIndex ? 'bg-surface-2' : ''}`}
                >
                  <span className="grid size-6 shrink-0 place-items-center text-muted">{entry.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  {entry.hint && <span className="shrink-0 text-xs text-muted">{entry.hint}</span>}
                  {index === activeIndex && <CornerDownLeft size={14} aria-hidden className="shrink-0 text-muted" />}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('pal.noMatch', { query: query.trim() })}</li>}
      </ul>
      <p className="border-t border-line px-3 py-2 text-xs text-muted">{t('pal.hint')}</p>
    </dialog>
  );
}
