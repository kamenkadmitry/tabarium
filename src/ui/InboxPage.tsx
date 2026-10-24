import { ArrowDownAZ, ArrowRightLeft, BookOpenText, CalendarDays, Inbox, Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { type DragEvent, type ReactNode, useState } from 'react';
import { groupInbox, INBOX_GROUPS, INBOX_SORTS, type InboxGroup, type InboxSort, siteOf, sortInbox } from '../core/inbox';
import type { Card, Collection } from '../core/types';
import { CardLabels } from './labels';
import { type CardRowActions, hostOf, PageFavicon } from './CardRow';
import { endDrag, getDragPayload, hasExternalLinks, LINKS_MIME } from './dnd';
import { Menu, MenuItem } from './Menu';
import type { CardSelection } from './useCardSelection';
import { useT } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/messages';

const SORT_KEYS: Record<InboxSort, StringKey> = {
  newest: 'inbox.sort.newest',
  oldest: 'inbox.sort.oldest',
  'title-asc': 'inbox.sort.titleAsc',
  'title-desc': 'inbox.sort.titleDesc',
  site: 'inbox.sort.siteAsc',
};

const GROUP_KEYS: Record<InboxGroup, StringKey> = {
  none: 'inbox.group.none',
  date: 'inbox.group.date',
  site: 'inbox.group.site',
  collection: 'inbox.group.collection',
};

const COLUMNS = 'grid grid-cols-[1.75rem_minmax(0,1fr)_7rem_auto] items-start gap-x-3 lg:grid-cols-[1.75rem_minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1.1fr)_7rem_auto]';

interface Props {
  collections: readonly Collection[];
  /** Every link in the Inbox space. */
  cards: readonly Card[];
  sort: InboxSort;
  group: InboxGroup;
  onSort: (sort: InboxSort) => void;
  onGroup: (group: InboxGroup) => void;
  selection: CardSelection;
  cardActions: (card: Card) => CardRowActions;
  /** The inline editor: `cardId` is the link being edited, or null; `adding` shows the add form on top. */
  editor: { cardId: string | null; adding: boolean; render: (card: Card | null) => ReactNode };
  onAdd: () => void;
  /** Present when an AI provider is configured. Receives the links to look at (the selected ones, or those without labels). */
  onSuggest?: (cards: readonly Card[]) => void;
  /** Reads the description and heading of the pages; `force` also re-reads pages that were read before. */
  onReadPages: (cardIds: readonly string[], force: boolean) => void;
  pagesEnabled: boolean;
  pagesBusy: boolean;
  /** A line about the last reading of pages. */
  pagesNote: string | null;
  /** Browser tabs dropped on the page are added to the Inbox. */
  onDropTabs: (tabIds: number[]) => void;
  onDropLinks: (raw: string) => void;
}

const iconButton = 'grid size-8 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2';

/**
 * The Inbox as a table: title and site, what the page says about itself, labels and when it was added. Sorting and
 * grouping are remembered; the AI can propose labels and collections for what is still unsorted.
 */
export function InboxPage(props: Props) {
  const t = useT();
  const { cards, selection, editor } = props;
  const [over, setOver] = useState(false);
  // The moment the page was opened decides what counts as "today" for the date groups.
  const [now] = useState(() => Date.now());
  const titleOfCollection = (id: string) => props.collections.find((c) => c.id === id)?.title ?? '';
  const groups = groupInbox(sortInbox(cards, props.sort), props.group, { now, collectionTitle: titleOfCollection });
  const ids = groups.flatMap((g) => g.cards.map((c) => c.id));
  const ticked = ids.filter((id) => selection.selected.has(id)).length;
  const selectedCards = cards.filter((c) => selection.selected.has(c.id));
  const unlabeled = cards.filter((c) => c.tagIds.length === 0 && c.hashtagIds.length === 0);
  const suggestScope = selectedCards.length > 0 ? selectedCards : unlabeled;
  const unread = cards.filter((c) => c.pageInfoAt === null);
  const readScope = selectedCards.length > 0 ? selectedCards : unread;

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (getDragPayload()?.type === 'tabs' || hasExternalLinks(e)) {
        e.preventDefault();
        setOver(true);
      }
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const payload = endDrag();
      if (payload?.type === 'tabs') props.onDropTabs(payload.tabIds);
      else if (!payload && hasExternalLinks(e)) props.onDropLinks(e.dataTransfer.getData(LINKS_MIME));
    },
  };

  return (
    <section aria-label={t('inbox.section')} {...dropProps} className={`rounded-2xl ${over ? 'ring-2 ring-primary' : ''}`}>
      <div role="toolbar" aria-label={t('inbox.options')} className="mb-4 flex flex-wrap items-center gap-1">
        <Menu label={t(SORT_KEYS[props.sort])} ariaLabel={t('inbox.sortAria')} icon={<ArrowDownAZ size={15} aria-hidden />}>
          {(close) =>
            INBOX_SORTS.map((s) => (
              <MenuItem
                key={s}
                checked={props.sort === s}
                onClick={() => {
                  props.onSort(s);
                  close();
                }}
              >
                {t(SORT_KEYS[s])}
              </MenuItem>
            ))
          }
        </Menu>
        <Menu label={t(GROUP_KEYS[props.group])} ariaLabel={t('inbox.groupAria')} icon={<CalendarDays size={15} aria-hidden />} active={props.group !== 'none'}>
          {(close) =>
            INBOX_GROUPS.map((g) => (
              <MenuItem
                key={g}
                checked={props.group === g}
                onClick={() => {
                  props.onGroup(g);
                  close();
                }}
              >
                {t(GROUP_KEYS[g])}
              </MenuItem>
            ))
          }
        </Menu>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          disabled={props.pagesBusy || (props.pagesEnabled && readScope.length === 0)}
          onClick={() => props.onReadPages(readScope.map((c) => c.id), selectedCards.length > 0)}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        >
          <BookOpenText size={15} aria-hidden />
          {props.pagesBusy ? t('inbox.reading') : !props.pagesEnabled ? t('inbox.loadDescriptions') : selectedCards.length > 0 ? t.plural('inbox.reread', selectedCards.length) : t.plural('inbox.readNew', unread.length)}
        </button>
        {props.onSuggest && (
          <button
            type="button"
            disabled={suggestScope.length === 0}
            onClick={() => props.onSuggest?.(suggestScope)}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            <Sparkles size={15} aria-hidden className="text-accent" /> {t('inbox.suggestLabels')}
            <span className="text-xs">{selectedCards.length > 0 ? t.plural('inbox.selected', selectedCards.length) : t.plural('inbox.unlabelled', unlabeled.length)}</span>
          </button>
        )}
        {props.pagesNote && (
          <span role="status" className="ml-2 text-xs text-muted">
            {props.pagesNote}
          </span>
        )}
        <button
          type="button"
          onClick={props.onAdd}
          className="ml-auto flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
        >
          <Plus size={16} aria-hidden /> {t('inbox.addLink')}
        </button>
      </div>

      {editor.adding && <div className="mb-4">{editor.render(null)}</div>}

      {cards.length === 0 ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <Inbox size={34} aria-hidden className="mx-auto text-muted" />
          <p className="mt-3 font-bold">{t('inbox.empty.title')}</p>
          <p className="mt-1 text-sm text-muted">{t('inbox.empty.text')}</p>
        </div>
      ) : (
        <div role="table" aria-label={t('inbox.table')} className="rounded-2xl border border-line bg-surface">
          <div role="row" className={`${COLUMNS} items-center border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted`}>
            <input
              type="checkbox"
              aria-label={t('inbox.selectAll')}
              checked={ticked === ids.length && ids.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = ticked > 0 && ticked < ids.length;
              }}
              onChange={() => selection.setMany(ids, ticked !== ids.length)}
              className="size-4 cursor-pointer accent-[var(--primary)]"
            />
            <span role="columnheader">{t('inbox.col.page')}</span>
            <span role="columnheader" className="hidden lg:block">
              {t('inbox.col.description')}
            </span>
            <span role="columnheader" className="hidden lg:block">
              {t('inbox.col.labels')}
            </span>
            <span role="columnheader">{t('inbox.col.added')}</span>
            <span aria-hidden className="w-[8.5rem]" />
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              {g.title !== '' && (
                <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                  {g.title} <span className="font-semibold">· {g.cards.length}</span>
                </h3>
              )}
              <ul>
                {g.cards.map((card) => {
                  const title = card.customTitle ?? card.title;
                  const actions = props.cardActions(card);
                  const picked = selection.selected.has(card.id);
                  const text = card.description ?? card.heading;
                  return (
                    <li key={card.id} data-card-id={card.id} className={`group border-b border-line last:border-b-0 ${picked || editor.cardId === card.id ? 'bg-surface-2' : ''}`}>
                      <div role="row" className={`${COLUMNS} px-3 py-2`}>
                        <input
                          type="checkbox"
                          checked={picked}
                          aria-label={t('card.select', { title })}
                          onClick={(e) => selection.toggle(card.id, e.shiftKey, ids)}
                          onChange={() => undefined}
                          className="mt-1 size-4 cursor-pointer accent-[var(--primary)]"
                        />
                        <div role="cell" className="flex min-w-0 items-start gap-2">
                          <span className="mt-0.5">
                            <PageFavicon url={card.url} favIconUrl={card.favIconUrl} size={18} />
                          </span>
                          <a href={card.url} className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{title}</span>
                            <span className="block truncate text-xs text-muted">{props.group === 'site' ? hostOf(card.url) : siteOf(card.url)}</span>
                          </a>
                        </div>
                        <div role="cell" className="hidden min-w-0 lg:block">
                          {text !== null && text !== undefined ? (
                            <>
                              <span title={text} className="line-clamp-2 text-sm">
                                {text}
                              </span>
                              {card.description && card.heading && card.heading !== card.description && (
                                <span className="mt-0.5 block truncate text-xs text-muted">{t('inbox.h1', { text: card.heading })}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted">{card.pageInfoAt === null ? '—' : t('inbox.noDescription')}</span>
                          )}
                        </div>
                        <div role="cell" className="hidden min-w-0 lg:block">
                          <CardLabels card={card} limitHashtags={3} />
                        </div>
                        <time role="cell" dateTime={new Date(card.createdAt).toISOString()} title={t.time(card.createdAt)} className="text-xs text-muted">
                          {t.time(card.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                        </time>
                        <div role="cell" className="flex w-[8.5rem] justify-end gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                          <button type="button" aria-label={t('card.edit')} onClick={actions.onEdit} className={`${iconButton} hover:text-primary`}>
                            <Pencil size={15} aria-hidden />
                          </button>
                          <button type="button" aria-label={t('card.move')} onClick={actions.onMove} className={`${iconButton} hover:text-primary`}>
                            <ArrowRightLeft size={15} aria-hidden />
                          </button>
                          <button type="button" aria-label={card.starred ? t('card.unstar') : t('card.star')} onClick={actions.onToggleStar} className={`${iconButton} hover:text-accent`}>
                            <Star size={15} aria-hidden fill={card.starred ? 'currentColor' : 'none'} />
                          </button>
                          <button type="button" aria-label={t('card.delete')} onClick={actions.onDelete} className={`${iconButton} hover:text-danger`}>
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      </div>
                      {editor.cardId === card.id && <div className="px-3 pb-3">{editor.render(card)}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
