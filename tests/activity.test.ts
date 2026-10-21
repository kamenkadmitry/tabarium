import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey } from '../src/core/activity';
import { exportBackup, parseBackup, restoreBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { findExistingLinks } from '../src/core/duplicates';
import { Repository } from '../src/core/repo';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

const counts = async () => Object.fromEntries((await db.activity.toArray()).map((a) => [a.type, a.count]));

describe('activity history', () => {
  it('counts links added and deleted per day, and deleted duplicates separately', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    const added = await repo.addCards(col.id, [
      { title: 'A', url: 'https://a.dev/' },
      { title: 'B', url: 'https://b.dev/' },
      { title: 'C', url: 'https://c.dev/' },
      { title: 'A again', url: 'https://a.dev' }, // skipped inside one collection: not counted
    ]);
    expect(added).toHaveLength(3);
    expect(await counts()).toEqual({ added: 3 });
    expect((await db.activity.toArray())[0]?.day).toBe(dayKey(Date.now()));

    const [a, b, c] = added;
    if (!a || !b || !c) throw new Error('cards were not added');
    await repo.deleteCard(a.id);
    await repo.deleteCards([b.id], 'duplicate');
    await repo.deleteCards(['missing']); // nothing existed, nothing is counted
    expect(await counts()).toEqual({ added: 3, deleted: 2, 'duplicates-removed': 1 });

    await repo.deleteCollection(col.id); // the remaining link goes with the collection
    expect((await counts()).deleted).toBe(3);

    await repo.recordActivity('duplicates-skipped', 2);
    await repo.recordActivity('duplicates-created', 1);
    expect(await counts()).toMatchObject({ 'duplicates-skipped': 2, 'duplicates-created': 1 });
  });

  it('is part of backups (older backups without it still load)', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    await repo.addCards(col.id, [{ title: 'A', url: 'https://a.dev/' }]);
    const backup = await exportBackup(db);
    expect(backup.activity).toEqual([expect.objectContaining({ type: 'added', count: 1 })]);

    await restoreBackup(db, parseBackup(JSON.stringify(backup)));
    expect(await counts()).toEqual({ added: 1 });

    const legacy = JSON.parse(JSON.stringify(backup)) as { activity?: unknown };
    delete legacy.activity;
    expect(parseBackup(JSON.stringify(legacy)).activity).toEqual([]);
  });

  it('starts the history from the links of an older database', async () => {
    const name = `legacy-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      spaces: 'id, position',
      collections: 'id, spaceId, position',
      cards: 'id, collectionId, url, starred, position',
      tags: 'id, position',
      nexts: 'id, cardId, position',
      settings: 'key',
    });
    old.version(2).stores({ collections: 'id, spaceId, position, *tagIds' });
    old.version(3).stores({ cards: 'id, collectionId, url, starred, position, *tagIds, *hashtagIds', hashtags: 'id, &name' });
    old.version(4).stores({});
    const at = (d: number) => new Date(2026, 9, d, 10).getTime();
    await old.table('cards').bulkAdd(
      [at(1), at(1), at(3)].map((createdAt, i) => ({ id: `c${i}`, collectionId: 'x', title: 't', url: `https://${i}.dev/`, position: i, tagIds: [], hashtagIds: [], createdAt, updatedAt: createdAt })),
    );
    old.close();

    const upgraded = new TabariumDB(name);
    const rows = (await upgraded.activity.toArray()).sort((a, b) => a.day.localeCompare(b.day));
    expect(rows).toEqual([
      { id: '2026-10-01|added', day: '2026-10-01', type: 'added', count: 2 },
      { id: '2026-10-03|added', day: '2026-10-03', type: 'added', count: 1 },
    ]);
  });
});

describe('finding links that are already in the library', () => {
  it('matches addresses the way the Duplicates page does, across spaces, with where they live', async () => {
    const one = await repo.createSpace('One');
    const two = await repo.createSpace('Two');
    const a = await repo.createCollection(one.id, 'Reading');
    const b = await repo.createCollection(two.id, 'Later');
    await repo.addCards(a.id, [{ title: 'Docs', url: 'https://docs.dev/page/' }]);
    await repo.addCards(b.id, [{ title: 'Docs copy', url: 'https://docs.dev/page#section' }]);

    const found = await findExistingLinks(db, ['https://docs.dev/page', 'https://new.dev/']);
    expect([...found.keys()]).toEqual(['https://docs.dev/page']);
    expect(found.get('https://docs.dev/page')).toEqual({ title: 'Docs', space: 'One', collection: 'Reading', copies: 2 });
    expect((await findExistingLinks(db, [])).size).toBe(0);
  });
});
