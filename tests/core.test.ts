import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { positionBetween } from '../src/core/position';
import { normalizeUrl, Repository } from '../src/core/repo';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

describe('position', () => {
  it('computes midpoints and edges', () => {
    expect(positionBetween(null, null)).toBe(100);
    expect(positionBetween(100, 200)).toBe(150);
    expect(positionBetween(null, 100)).toBe(0);
    expect(positionBetween(300, null)).toBe(400);
  });
  it('rejects inverted neighbours', () => {
    expect(() => positionBetween(200, 100)).toThrow(RangeError);
  });
});

describe('repository', () => {
  it('skips duplicate urls within a collection', async () => {
    const space = await repo.createSpace('Work');
    const col = await repo.createCollection(space.id, 'Reading');
    const added = await repo.addCards(col.id, [
      { title: 'A', url: 'https://example.com/' },
      { title: 'A again', url: 'https://example.com#frag' },
      { title: 'B', url: 'https://example.com/b' },
    ]);
    expect(added.map((c) => c.title)).toEqual(['A', 'B']);
    expect(added.map((c) => c.position)).toEqual([100, 200]);
  });
  it('fails fast on unknown parents', async () => {
    await expect(repo.createCollection('nope', 'x')).rejects.toThrow(/does not exist/);
    await expect(repo.addCards('nope', [])).rejects.toThrow(/does not exist/);
  });
  it('normalizes urls', () => {
    expect(normalizeUrl('https://a.com/')).toBe('https://a.com');
    expect(normalizeUrl('https://a.com/x/#h')).toBe('https://a.com/x');
  });
});

describe('manual management', () => {
  it('renames, recolors, stars, moves and deletes', async () => {
    const space = await repo.createSpace('S');
    const a = await repo.createCollection(space.id, 'A');
    const b = await repo.createCollection(space.id, 'B');
    const [card] = await repo.addCards(a.id, [{ title: 'T', url: 'https://x.dev/1' }]);

    await repo.updateCollection(a.id, { title: 'A2', color: '#ea580c' });
    await repo.updateCard(card!.id, { starred: true, customTitle: 'Mine' });
    await repo.moveCard(card!.id, b.id);

    expect((await db.collections.get(a.id))?.title).toBe('A2');
    const moved = await db.cards.get(card!.id);
    expect(moved).toMatchObject({ collectionId: b.id, starred: true, customTitle: 'Mine' });

    await repo.deleteCard(card!.id);
    expect(await db.cards.count()).toBe(0);
  });
  it('deleting a space cascades', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    await repo.addCards(col.id, [{ title: 'T', url: 'https://x.dev/1' }]);
    await repo.deleteSpace(space.id);
    expect(await db.spaces.count()).toBe(0);
    expect(await db.collections.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
  it('rejects invalid urls and unknown ids', async () => {
    await expect(repo.updateCard('nope', { starred: true })).rejects.toThrow(/does not exist/);
    await expect(repo.updateCard('nope', { url: 'not a url' })).rejects.toThrow();
    await expect(repo.renameSpace('nope', 'x')).rejects.toThrow(/does not exist/);
  });
});

describe('backup', () => {
  async function seed() {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    await repo.addCards(col.id, [{ title: 'T', url: 'https://x.dev/1' }]);
    return space;
  }

  it('round-trips', async () => {
    await seed();
    const json = JSON.stringify(await exportBackup(db));
    const other = new TabariumDB(`test-${crypto.randomUUID()}`);
    await restoreBackup(other, parseBackup(json));
    expect(await other.cards.count()).toBe(1);
    expect((await other.collections.toArray())[0]?.title).toBe('C');
  });
  it('rejects broken references and newer schemas', async () => {
    await seed();
    const b = await exportBackup(db);
    expect(() => parseBackup(JSON.stringify({ ...b, collections: [] }))).toThrow(/missing collection/);
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 99 }))).toThrow(/newer/);
    expect(() => parseBackup('{}')).toThrow();
  });
  it('restore is all-or-nothing', async () => {
    const space = await seed();
    const b = await exportBackup(db);
    const bad = { ...b, spaces: [...b.spaces, b.spaces[0]!] }; // duplicate primary key
    await expect(restoreBackup(db, bad)).rejects.toThrow();
    expect((await db.spaces.get(space.id))?.name).toBe('S');
    expect(await db.cards.count()).toBe(1);
  });
});
