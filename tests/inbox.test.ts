import { describe, expect, it } from 'vitest';
import { dateBucket, groupInbox, siteOf, sortInbox } from '../src/core/inbox';
import type { Card } from '../src/core/types';

const card = (id: string, title: string, url: string, createdAt: number, collectionId = 'c1'): Card => ({
  id,
  collectionId,
  title,
  url,
  favIconUrl: null,
  customTitle: null,
  note: null,
  description: null,
  heading: null,
  pageInfoAt: null,
  starred: false,
  tagIds: [],
  hashtagIds: [],
  position: 0,
  createdAt,
  updatedAt: createdAt,
});

const NOW = new Date(2026, 9, 21, 15, 0).getTime(); // 21 Oct 2026, 15:00 local time
const daysAgo = (n: number, hour = 9) => new Date(2026, 9, 21 - n, hour).getTime();

describe('Inbox sorting', () => {
  const cards = [
    card('a', 'banana', 'https://www.zed.dev/a', daysAgo(2)),
    card('b', 'Apple', 'https://alpha.dev/b', daysAgo(0)),
    card('c', 'cherry', 'https://alpha.dev/c', daysAgo(5)),
  ];
  const ids = (sort: Parameters<typeof sortInbox>[1]) => sortInbox(cards, sort).map((c) => c.id);

  it('orders by time added, title and site, without touching the input', () => {
    expect(ids('newest')).toEqual(['b', 'a', 'c']);
    expect(ids('oldest')).toEqual(['c', 'a', 'b']);
    expect(ids('title-asc')).toEqual(['b', 'a', 'c']);
    expect(ids('title-desc')).toEqual(['c', 'a', 'b']);
    expect(ids('site')).toEqual(['b', 'c', 'a']); // alpha.dev (Apple, cherry), then zed.dev
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('names a site without www', () => expect(siteOf('https://www.example.com/x')).toBe('example.com'));
});

describe('Inbox grouping', () => {
  it('puts links into calendar buckets, newest first', () => {
    expect(dateBucket(daysAgo(0, 1), NOW).title).toBe('Today');
    expect(dateBucket(daysAgo(1, 23), NOW).title).toBe('Yesterday');
    expect(dateBucket(daysAgo(4), NOW).title).toBe('Last 7 days');
    expect(dateBucket(daysAgo(20), NOW).title).toBe('Last 30 days');
    expect(dateBucket(new Date(2026, 7, 3).getTime(), NOW).title).toBe('August 2026');
  });

  it('groups by date, site and collection; "none" is one untitled group', () => {
    const cards = [
      card('a', 'a', 'https://b.dev/', daysAgo(0), 'c2'),
      card('b', 'b', 'https://a.dev/', daysAgo(3), 'c1'),
      card('c', 'c', 'https://a.dev/2', new Date(2026, 7, 3).getTime(), 'c1'),
      card('d', 'd', 'https://a.dev/3', new Date(2026, 5, 3).getTime(), 'c1'),
    ];
    const ctx = { now: NOW, collectionTitle: (id: string) => (id === 'c1' ? 'One' : 'Two') };
    expect(groupInbox(cards, 'date', ctx).map((g) => g.title)).toEqual(['Today', 'Last 7 days', 'August 2026', 'June 2026']);
    expect(groupInbox(cards, 'site', ctx).map((g) => [g.title, g.cards.length])).toEqual([
      ['a.dev', 3],
      ['b.dev', 1],
    ]);
    expect(groupInbox(cards, 'collection', ctx).map((g) => g.title)).toEqual(['One', 'Two']);
    expect(groupInbox(cards, 'none', ctx)).toEqual([{ key: 'all', title: '', cards }]);
  });
});
