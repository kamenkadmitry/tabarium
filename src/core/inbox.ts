import type { Card } from './types';
import { tr } from '../i18n/runtime';

export const INBOX_SORTS = ['newest', 'oldest', 'title-asc', 'title-desc', 'site'] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

export const INBOX_GROUPS = ['none', 'date', 'site', 'collection'] as const;
export type InboxGroup = (typeof INBOX_GROUPS)[number];

const DAY = 86_400_000;

/** The site of an address without "www.", the way people recognise it. */
export const siteOf = (url: string): string => new URL(url).hostname.replace(/^www\./, '');

const titleOf = (c: Card): string => c.customTitle ?? c.title;
const byTitle = (a: Card, b: Card) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base', numeric: true });

/** Sorts a copy. Ties keep the newest link first. */
export function sortInbox(cards: readonly Card[], sort: InboxSort): Card[] {
  const compare: Record<InboxSort, (a: Card, b: Card) => number> = {
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    'title-asc': byTitle,
    'title-desc': (a, b) => byTitle(b, a),
    site: (a, b) => siteOf(a.url).localeCompare(siteOf(b.url)) || byTitle(a, b),
  };
  return [...cards].sort((a, b) => compare[sort](a, b) || b.createdAt - a.createdAt);
}

export interface InboxGroupResult {
  key: string;
  /** Empty for the single group of an ungrouped list. */
  title: string;
  cards: Card[];
}

/** How long ago a link was added, as the label of its date group. Days are counted on the calendar, not in 24-hour steps. */
export function dateBucket(createdAt: number, now: number): { order: number; title: string } {
  const startOf = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOf(now) - startOf(createdAt)) / DAY);
  if (days <= 0) return { order: 0, title: tr()('inbox.date.today') };
  if (days === 1) return { order: 1, title: tr()('inbox.date.yesterday') };
  if (days <= 7) return { order: 2, title: tr()('inbox.date.last7') };
  if (days <= 30) return { order: 3, title: tr()('inbox.date.last30') };
  const d = new Date(createdAt);
  // Older links are grouped by month, newest month first.
  const month = d.getFullYear() * 12 + d.getMonth();
  return { order: 4 + (100_000 - month) / 100_000, title: tr().date(d, { month: 'long', year: 'numeric' }) };
}

/** Splits an already sorted list into groups. Cards keep their order inside each group. */
export function groupInbox(cards: readonly Card[], group: InboxGroup, context: { now: number; collectionTitle: (collectionId: string) => string }): InboxGroupResult[] {
  if (group === 'none') return [{ key: 'all', title: '', cards: [...cards] }];
  const groups = new Map<string, { title: string; order: number; cards: Card[] }>();
  for (const card of cards) {
    let title: string;
    let order = 0;
    if (group === 'date') {
      const b = dateBucket(card.createdAt, context.now);
      title = b.title;
      order = b.order;
    } else if (group === 'site') {
      title = siteOf(card.url);
    } else {
      title = context.collectionTitle(card.collectionId);
    }
    const entry = groups.get(title) ?? { title, order, cards: [] };
    entry.cards.push(card);
    groups.set(title, entry);
  }
  return [...groups.values()]
    .sort((a, b) => (group === 'date' ? a.order - b.order : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })))
    .map((g) => ({ key: g.title, title: g.title, cards: g.cards }));
}
