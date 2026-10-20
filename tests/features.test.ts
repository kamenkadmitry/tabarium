import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { parseBookmarksHtml, toBookmarksHtml, toPlainText } from '../src/core/formats';
import { planInsert } from '../src/core/ordering';
import { Repository } from '../src/core/repo';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

async function seed() {
  const space = await repo.createSpace('Work');
  const col = await repo.createCollection(space.id, 'Reading');
  const cards = await repo.addCards(col.id, [
    { title: 'A', url: 'https://a.dev/' },
    { title: 'B & <C>', url: 'https://b.dev/?x=1&y=2' },
    { title: 'C', url: 'https://c.dev/' },
  ]);
  return { space, col, cards };
}

describe('ordering', () => {
  it('inserts before a neighbour using midpoints', () => {
    const plan = planInsert(
      [
        { id: 'a', position: 100 },
        { id: 'b', position: 200 },
      ],
      'b',
    );
    expect(plan).toEqual({ position: 150, respace: null });
  });
  it('appends and prepends', () => {
    const items = [{ id: 'a', position: 100 }];
    expect(planInsert(items, null).position).toBe(200);
    expect(planInsert(items, 'a').position).toBe(0);
  });
  it('re-spaces when the gap is exhausted', () => {
    const plan = planInsert(
      [
        { id: 'a', position: 1 },
        { id: 'b', position: 1.0001 },
      ],
      'b',
    );
    expect(plan.respace).toEqual([
      { id: 'a', position: 100 },
      { id: 'b', position: 200 },
    ]);
    expect(plan.position).toBe(150);
  });
  it('rejects an unknown anchor', () => {
    expect(() => planInsert([], 'zzz')).toThrow(/not among/);
  });
});

describe('drag and drop moves', () => {
  it('reorders a card within and across collections', async () => {
    const { space, col, cards } = await seed();
    const other = await repo.createCollection(space.id, 'Other');
    await repo.moveCard(cards[2]!.id, col.id, cards[0]!.id); // C before A
    const order = (await db.cards.where('collectionId').equals(col.id).sortBy('position')).map((c) => c.title);
    expect(order).toEqual(['C', 'A', 'B & <C>']);

    await repo.moveCard(cards[0]!.id, other.id);
    expect((await db.cards.get(cards[0]!.id))?.collectionId).toBe(other.id);
  });
  it('reorders collections and moves them between spaces', async () => {
    const { space, col } = await seed();
    const second = await repo.createCollection(space.id, 'Second');
    await repo.moveCollection(second.id, space.id, col.id);
    const order = (await db.collections.where('spaceId').equals(space.id).sortBy('position')).map((c) => c.title);
    expect(order).toEqual(['Second', 'Reading']);

    const travel = await repo.createSpace('Travel');
    await repo.moveCollection(col.id, travel.id);
    expect((await db.collections.get(col.id))?.spaceId).toBe(travel.id);
  });
});

describe('adding cards at a position', () => {
  it('inserts several cards before an anchor in order and skips duplicates', async () => {
    const { col, cards } = await seed();
    const added = await repo.addCardsBefore(
      col.id,
      [
        { title: 'N1', url: 'https://n1.dev' },
        { title: 'dup of A', url: 'https://a.dev' },
        { title: 'N2', url: 'https://n2.dev' },
      ],
      cards[1]!.id, // before B
    );
    expect(added.map((c) => c.title)).toEqual(['N1', 'N2']);
    const order = (await db.cards.where('collectionId').equals(col.id).sortBy('position')).map((c) => c.title);
    expect(order).toEqual(['A', 'N1', 'N2', 'B & <C>', 'C']);
  });
  it('appends when there is no anchor and rejects an anchor from another collection', async () => {
    const { space, col } = await seed();
    const other = await repo.createCollection(space.id, 'Other');
    const [foreign] = await repo.addCards(other.id, [{ title: 'F', url: 'https://f.dev' }]);
    await repo.addCardsBefore(col.id, [{ title: 'Z', url: 'https://z.dev' }], null);
    expect((await db.cards.where('collectionId').equals(col.id).sortBy('position')).at(-1)?.title).toBe('Z');
    await expect(repo.addCardsBefore(col.id, [{ title: 'Y', url: 'https://y.dev' }], foreign!.id)).rejects.toThrow(/not in collection/);
    await expect(repo.addCardsBefore(col.id, [], 'missing')).rejects.toThrow(/not in collection/);
  });
});

describe('tags', () => {
  it('assigns, validates and cleans up on delete', async () => {
    const { col } = await seed();
    const tag = await repo.createTag('Later', '#ea580c');
    await repo.setCollectionTags(col.id, [tag.id, tag.id]);
    expect((await db.collections.get(col.id))?.tagIds).toEqual([tag.id]);
    await expect(repo.setCollectionTags(col.id, ['missing'])).rejects.toThrow(/does not exist/);
    await repo.deleteTag(tag.id);
    expect((await db.collections.get(col.id))?.tagIds).toEqual([]);
  });
});

describe('next queue', () => {
  it('queues once, reorders, completes and cascades with the card', async () => {
    const { cards } = await seed();
    const a = await repo.addToNext(cards[0]!.id);
    expect((await repo.addToNext(cards[0]!.id)).id).toBe(a.id);
    const b = await repo.addToNext(cards[1]!.id);
    await repo.moveNext(b.id, a.id);
    const order = (await db.nexts.orderBy('position').toArray()).map((n) => n.id);
    expect(order).toEqual([b.id, a.id]);
    await repo.setNextState(a.id, 'done');
    expect((await db.nexts.get(a.id))?.state).toBe('done');
    await repo.deleteCard(cards[0]!.id);
    expect(await db.nexts.get(a.id)).toBeUndefined();
  });
});

describe('duplicates', () => {
  it('finds the same url across collections', async () => {
    const { space } = await seed();
    const other = await repo.createCollection(space.id, 'Other');
    await repo.addCards(other.id, [{ title: 'A again', url: 'https://a.dev' }]);
    const groups = await repo.findDuplicates();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });
});

describe('export and import formats', () => {
  it('exports escaped bookmarks html and text', async () => {
    await seed();
    const backup = await exportBackup(db);
    const html = toBookmarksHtml(backup);
    expect(html).toContain('B &amp; &lt;C&gt;');
    expect(html).toContain('HREF="https://b.dev/?x=1&amp;y=2"');
    expect(toPlainText(backup)).toContain('Work / Reading');
  });
  it('round-trips through the bookmarks html parser', async () => {
    await seed();
    const html = toBookmarksHtml(await exportBackup(db));
    const parsed = parseBookmarksHtml(html);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe('Work');
    expect(parsed[0]?.collections[0]?.links.map((l) => l.url)).toEqual([
      'https://a.dev/',
      'https://b.dev/?x=1&y=2',
      'https://c.dev/',
    ]);
  });
  it('imports into the library without touching existing data', async () => {
    await seed();
    const html = `<DL><p><DT><H3>Loose</H3><DL><p><DT><A HREF="https://x.io/">X</A><DT><A HREF="https://x.io">X dup</A><DT><A HREF="javascript:alert(1)">bad</A></DL><p></DL>`;
    const result = await repo.importStructure(parseBookmarksHtml(html));
    expect(result).toEqual({ collections: 1, cards: 1 });
    expect(await db.cards.count()).toBe(4);
    expect(await db.spaces.count()).toBe(2);
  });
  it('rejects non-bookmark input', () => {
    expect(() => parseBookmarksHtml('<p>hello</p>')).toThrow(/no <DL>/);
  });
});
