import { beforeEach, describe, expect, it } from 'vitest';
import { filterCollections, isFiltering, NO_FILTER, sortCollections } from '../src/core/board';
import { TabariumDB } from '../src/core/db';
import { Repository } from '../src/core/repo';
import type { Collection } from '../src/core/types';

const col = (over: Partial<Collection> & Pick<Collection, 'id' | 'title'>): Collection => ({
  spaceId: 's',
  color: null,
  expanded: true,
  tagIds: [],
  position: 100,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const sample = [
  col({ id: 'a', title: 'beta', position: 100, createdAt: 30, color: '#ea580c', tagIds: ['t1'] }),
  col({ id: 'b', title: 'Alpha 10', position: 200, createdAt: 10, tagIds: ['t1', 't2'] }),
  col({ id: 'c', title: 'alpha 2', position: 300, createdAt: 20, color: '#0d9488' }),
];
const counts = new Map([['a', 1], ['b', 5], ['c', 5]]);

describe('sortCollections', () => {
  const ids = (sort: Parameters<typeof sortCollections>[1]) => sortCollections(sample, sort, counts).map((c) => c.id);
  it('keeps the manual order for "custom"', () => expect(ids('custom')).toEqual(['a', 'b', 'c']));
  it('sorts names naturally and case-insensitively', () => {
    expect(ids('name-asc')).toEqual(['c', 'b', 'a']); // alpha 2 < Alpha 10 < beta
    expect(ids('name-desc')).toEqual(['a', 'b', 'c']);
  });
  it('sorts by age', () => {
    expect(ids('newest')).toEqual(['a', 'c', 'b']);
    expect(ids('oldest')).toEqual(['b', 'c', 'a']);
  });
  it('sorts by size and breaks ties by manual order', () => expect(ids('most-tabs')).toEqual(['b', 'c', 'a']));
  it('never mutates its input', () => {
    const before = sample.map((c) => c.id);
    sortCollections(sample, 'name-asc', counts);
    expect(sample.map((c) => c.id)).toEqual(before);
  });
});

describe('filterCollections', () => {
  it('passes everything without a filter', () => {
    expect(filterCollections(sample, NO_FILTER)).toHaveLength(3);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });
  it('filters by colour, "none" and tag, alone or combined', () => {
    expect(filterCollections(sample, { color: '#0d9488', tagId: null }).map((c) => c.id)).toEqual(['c']);
    expect(filterCollections(sample, { color: 'none', tagId: null }).map((c) => c.id)).toEqual(['b']);
    expect(filterCollections(sample, { color: null, tagId: 't1' }).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterCollections(sample, { color: '#ea580c', tagId: 't1' }).map((c) => c.id)).toEqual(['a']);
    expect(isFiltering({ color: 'none', tagId: null })).toBe(true);
  });
});

describe('expand / collapse all', () => {
  let db: TabariumDB;
  let repo: Repository;
  beforeEach(() => {
    db = new TabariumDB(`test-${crypto.randomUUID()}`);
    repo = new Repository(db);
  });
  it('affects only the given space', async () => {
    const one = await repo.createSpace('One');
    const two = await repo.createSpace('Two');
    await repo.createCollection(one.id, 'A');
    await repo.createCollection(one.id, 'B');
    const other = await repo.createCollection(two.id, 'C');
    await repo.setExpandedAll(one.id, false);
    expect((await db.collections.where('spaceId').equals(one.id).toArray()).every((c) => !c.expanded)).toBe(true);
    expect((await db.collections.get(other.id))?.expanded).toBe(true);
    await repo.setExpandedAll(one.id, true);
    expect((await db.collections.where('spaceId').equals(one.id).toArray()).every((c) => c.expanded)).toBe(true);
  });
});
