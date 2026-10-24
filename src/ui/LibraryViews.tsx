import { Copy, SearchX } from 'lucide-react';
import type { Card, Collection, Space } from '../core/types';
import { useT } from '../i18n/I18nProvider';
import { displayCollectionName, displaySpaceName } from '../core/quicksave';
import type { OpenTab } from '../platform/ports';
import { CardRow, type CardRowActions, hostOf } from './CardRow';
import { EmptyState } from './EmptyState';

interface ResultGroup {
  collection: Collection;
  space: Space | undefined;
  cards: Card[];
}

export function SearchResults(props: {
  groups: readonly ResultGroup[];
  query: string;
  cardActions: (card: Card) => CardRowActions;
  /** Currently open browser tabs that match the query (not saved yet). */
  openTabs: readonly OpenTab[];
  onFocusTab: (tabId: number) => void;
  onAddOpenTab: (tabId: number) => void;
}) {
  const t = useT();
  if (props.groups.length === 0 && props.openTabs.length === 0) {
    return <EmptyState className="mt-16" icon={<SearchX />} title={t('empty.noTabsMatch.title', { query: props.query })} hint={t('empty.noTabsMatch.hint')} />;
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {props.openTabs.length > 0 && (
        <section aria-label={t('lv.openTabs')} className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-bold">{t('lv.openTabs')}</h2>
          <ul className="p-2">
            {props.openTabs.map((tab) => (
              <li key={tab.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface-2">
                <button type="button" onClick={() => props.onFocusTab(tab.id)} className="min-w-0 flex-1 py-1.5 text-left">
                  <span className="block truncate text-sm font-medium">{tab.title}</span>
                  <span className="block truncate text-xs text-muted">{hostOf(tab.url)} · {t('card.openInBrowser')}</span>
                </button>
                <button
                  type="button"
                  aria-label={t('lv.addToCollectionAria', { title: tab.title })}
                  onClick={() => props.onAddOpenTab(tab.id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface"
                >
                  {t('lv.addToCollection')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {props.groups.map(({ collection, space, cards }) => (
        <section key={collection.id} aria-label={displayCollectionName(space, collection)} className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-bold">
            <span className="text-muted">{space ? displaySpaceName(space) : ''} / </span>
            {displayCollectionName(space, collection)}
          </h2>
          <ul className="p-2">
            {cards.map((c) => (
              <CardRow key={c.id} card={c} draggable={false} {...props.cardActions(c)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DuplicatesView(props: {
  groups: readonly { url: string; cards: Card[]; collections: Map<string, Collection> }[];
  cardActions: (card: Card) => CardRowActions;
}) {
  const t = useT();
  if (props.groups.length === 0) return <EmptyState className="mt-16" icon={<Copy />} title={t('empty.noDuplicates.title')} hint={t('empty.noDuplicates.hint')} />;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {props.groups.map((g) => (
        <section key={g.url} className="rounded-2xl border border-line bg-surface">
          <h2 className="truncate border-b border-line px-4 py-3 text-sm font-bold">{hostOf(g.url)}</h2>
          <ul className="p-2">
            {g.cards.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                draggable={false}
                meta={t('card.inCollection', { name: g.collections.get(c.collectionId)?.title ?? t('card.unknownCollection') })}
                {...props.cardActions(c)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
