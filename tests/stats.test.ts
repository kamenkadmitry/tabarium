import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey } from '../src/core/activity';
import { TabariumDB } from '../src/core/db';
import { Repository } from '../src/core/repo';
import { computeStats } from '../src/core/stats';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

const input = async (now = Date.now()) => ({
  spaces: await db.spaces.toArray(),
  collections: await db.collections.toArray(),
  cards: await db.cards.toArray(),
  tags: await db.tags.toArray(),
  hashtags: await db.hashtags.toArray(),
  activity: await db.activity.toArray(),
  now,
});

describe('computeStats', () => {
  it('counts the library, the duplicates in it and the history of today', async () => {
    const space = await repo.createSpace('S');
    const a = await repo.createCollection(space.id, 'A');
    const b = await repo.createCollection(space.id, 'B');
    const [x] = await repo.addCards(a.id, [
      { title: 'X', url: 'https://x.dev/' },
      { title: 'Y', url: 'https://y.dev/p' },
    ]);
    await repo.addCards(b.id, [{ title: 'X again', url: 'https://x.dev' }]);
    if (!x) throw new Error('no card');
    await repo.deleteCard(x.id, 'duplicate');
    await repo.recordActivity('duplicates-skipped', 2);

    const stats = computeStats(await input(), 'today');
    expect(stats.totals).toMatchObject({ links: 2, collections: 2, spaces: 1, everAdded: 3, everDeleted: 1 });
    expect(stats.period).toMatchObject({ added: 3, deleted: 1, 'duplicates-removed': 1, 'duplicates-skipped': 2 });
    expect(stats.duplicates).toEqual({ groups: 0, extraCopies: 0 });
    expect(stats.series).toHaveLength(7);
    expect(stats.series.at(-1)).toEqual({ day: dayKey(Date.now()), added: 3, deleted: 1 });
    expect(stats.topSites.map((r) => r.label).sort()).toEqual(['x.dev', 'y.dev']);
  });

  it('finds duplicate groups still in the library and only counts history inside the period', async () => {
    const space = await repo.createSpace('S');
    const a = await repo.createCollection(space.id, 'A');
    const b = await repo.createCollection(space.id, 'B');
    await repo.addCards(a.id, [{ title: 'X', url: 'https://x.dev/' }]);
    await repo.addCards(b.id, [{ title: 'X', url: 'https://x.dev/#top' }]);
    const old = Date.now() - 40 * 86_400_000;
    await db.activity.put({ id: `${dayKey(old)}|added`, day: dayKey(old), type: 'added', count: 5 });

    const rows = await input();
    expect(computeStats(rows, '30d').duplicates).toEqual({ groups: 1, extraCopies: 1 });
    expect(computeStats(rows, '30d').period.added).toBe(2);
    expect(computeStats(rows, 'all').period.added).toBe(7);
    expect(computeStats(rows, 'all').series).toHaveLength(90);
  });
});
