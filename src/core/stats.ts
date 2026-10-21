import { dayKey } from './activity';
import { siteOf } from './inbox';
import type { Activity, ActivityType, Card, Collection, Hashtag, Space, Tag } from './types';
import { normalizeUrl } from './url';

export const STATS_PERIODS = ['today', '7d', '30d', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface StatsInput {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cards: readonly Card[];
  tags: readonly Tag[];
  hashtags: readonly Hashtag[];
  activity: readonly Activity[];
  now: number;
}

export interface Ranked {
  label: string;
  count: number;
}

export interface Stats {
  totals: {
    links: number;
    collections: number;
    spaces: number;
    tags: number;
    hashtags: number;
    starred: number;
    /** Links with at least one tag or hashtag. */
    labelled: number;
    inbox: number;
    /** Every link ever added, deleted ones included. */
    everAdded: number;
    everDeleted: number;
  };
  period: Record<ActivityType, number>;
  /** Copies of an address that are in the library now (second and further copies). */
  duplicates: { groups: number; extraCopies: number };
  series: { day: string; added: number; deleted: number }[];
  topSites: Ranked[];
  topHashtags: Ranked[];
  topTags: Ranked[];
  perSpace: Ranked[];
}

/** How many days the history chart shows for each period. */
const SERIES_DAYS: Record<StatsPeriod, number> = { today: 7, '7d': 7, '30d': 30, all: 90 };
const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all'>, number> = { today: 1, '7d': 7, '30d': 30 };

/** Day keys from `count - 1` days ago up to today, in local time. */
function lastDays(now: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (count - 1 - i));
    return dayKey(d.getTime());
  });
}

function rank(counts: Map<string, number>, limit: number): Ranked[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

/** Everything the dashboard shows, computed from the library and its daily activity counters. */
export function computeStats(input: StatsInput, period: StatsPeriod): Stats {
  const { spaces, collections, cards, tags, hashtags, activity, now } = input;
  const inboxSpaceIds = new Set(spaces.filter((s) => s.kind === 'inbox').map((s) => s.id));
  const spaceOfCollection = new Map(collections.map((c) => [c.id, c.spaceId]));
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const tagTitle = new Map(tags.map((t) => [t.id, t.title]));
  const hashtagName = new Map(hashtags.map((h) => [h.id, h.name]));

  const inWindow = (() => {
    if (period === 'all') return () => true;
    const days = new Set(lastDays(now, PERIOD_DAYS[period]));
    return (day: string) => days.has(day);
  })();
  const periodTotals: Record<ActivityType, number> = {
    added: 0,
    deleted: 0,
    'duplicates-removed': 0,
    'duplicates-skipped': 0,
    'duplicates-created': 0,
  };
  const everAdded = { value: 0 };
  const everDeleted = { value: 0 };
  const perDay = new Map<string, { added: number; deleted: number }>();
  for (const a of activity) {
    if (inWindow(a.day)) periodTotals[a.type] += a.count;
    if (a.type === 'added') everAdded.value += a.count;
    if (a.type === 'deleted') everDeleted.value += a.count;
    if (a.type === 'added' || a.type === 'deleted') {
      const row = perDay.get(a.day) ?? { added: 0, deleted: 0 };
      row[a.type] += a.count;
      perDay.set(a.day, row);
    }
  }

  const byUrl = new Map<string, number>();
  const sites = new Map<string, number>();
  const hashtagUse = new Map<string, number>();
  const tagUse = new Map<string, number>();
  const spaceUse = new Map<string, number>();
  let starred = 0;
  let labelled = 0;
  let inbox = 0;
  for (const card of cards) {
    bump(byUrl, normalizeUrl(card.url));
    bump(sites, siteOf(card.url));
    if (card.starred) starred += 1;
    if (card.tagIds.length > 0 || card.hashtagIds.length > 0) labelled += 1;
    for (const id of card.tagIds) {
      const title = tagTitle.get(id);
      if (title) bump(tagUse, title);
    }
    for (const id of card.hashtagIds) {
      const name = hashtagName.get(id);
      if (name) bump(hashtagUse, `#${name}`);
    }
    const spaceId = spaceOfCollection.get(card.collectionId);
    if (spaceId !== undefined) {
      if (inboxSpaceIds.has(spaceId)) inbox += 1;
      bump(spaceUse, spaceName.get(spaceId) ?? '');
    }
  }
  let groups = 0;
  let extraCopies = 0;
  for (const n of byUrl.values()) {
    if (n > 1) {
      groups += 1;
      extraCopies += n - 1;
    }
  }

  return {
    totals: {
      links: cards.length,
      collections: collections.length,
      spaces: spaces.filter((s) => s.kind !== 'inbox').length,
      tags: tags.length,
      hashtags: hashtags.length,
      starred,
      labelled,
      inbox,
      everAdded: everAdded.value,
      everDeleted: everDeleted.value,
    },
    period: periodTotals,
    duplicates: { groups, extraCopies },
    series: lastDays(now, SERIES_DAYS[period]).map((day) => ({ day, ...(perDay.get(day) ?? { added: 0, deleted: 0 }) })),
    topSites: rank(sites, 6),
    topHashtags: rank(hashtagUse, 6),
    topTags: rank(tagUse, 6),
    perSpace: rank(spaceUse, 8),
  };
}
