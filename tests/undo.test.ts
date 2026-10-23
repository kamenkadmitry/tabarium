import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
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
    { title: 'B', url: 'https://b.dev/' },
    { title: 'C', url: 'https://c.dev/' },
  ]);
  return { space, col, cards };
}

const counts = async () => Object.fromEntries((await db.activity.toArray()).map((a) => [a.type, a.count]));

describe('undo: links', () => {
  it('restores a deleted link with its position and labels', async () => {
    const { col, cards } = await seed();
    const [a, b, c] = cards;
    if (!a || !b || !c) throw new Error('cards were not added');
    const tag = await repo.createTag('Keep', '#0d9488');
    const hashtag = await repo.ensureHashtag('read');
    await repo.setCardLabels(b.id, { tagIds: [tag.id], hashtagIds: [hashtag.id] });

    const deletion = await repo.deleteCard(b.id);
    expect(await db.cards.get(b.id)).toBeUndefined();
    expect((await counts()).deleted).toBe(1);

    await repo.restoreDeletion(deletion);
    const restored = await db.cards.get(b.id);
    expect(restored).toMatchObject({ collectionId: col.id, position: b.position, tagIds: [tag.id], hashtagIds: [hashtag.id], createdAt: b.createdAt });
    // It lands back between its old neighbours.
    const ordered = await db.cards.where('collectionId').equals(col.id).sortBy('position');
    expect(ordered.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect((await counts()).deleted).toBeUndefined();
  });

  it('restores a bulk delete and takes back the duplicate counter', async () => {
    const { cards } = await seed();
    const [a, b] = cards;
    if (!a || !b) throw new Error('cards were not added');
    const deletion = await repo.deleteCards([a.id, b.id], 'duplicate');
    expect(await counts()).toMatchObject({ deleted: 2, 'duplicates-removed': 2 });

    await repo.restoreDeletion(deletion);
    expect(await db.cards.count()).toBe(3);
    expect(await counts()).toEqual({ added: 3 });
  });
});

describe('undo: collections and spaces', () => {
  it('restores a collection with its links at their old positions', async () => {
    const { col, cards } = await seed();
    const deletion = await repo.deleteCollection(col.id);
    expect(await db.collections.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect((await counts()).deleted).toBe(3);

    await repo.restoreDeletion(deletion);
    const restored = await db.collections.get(col.id);
    expect(restored).toMatchObject({ title: 'Reading', spaceId: col.spaceId, position: col.position });
    const ordered = await db.cards.where('collectionId').equals(col.id).sortBy('position');
    expect(ordered.map((x) => x.id)).toEqual(cards.map((x) => x.id));
    expect((await counts()).deleted).toBeUndefined();
  });

  it('restores a space with its collections and links', async () => {
    const { space, col, cards } = await seed();
    const other = await repo.createCollection(space.id, 'Later');
    await repo.addCards(other.id, [{ title: 'D', url: 'https://d.dev/' }]);

    const deletion = await repo.deleteSpace(space.id);
    expect(await db.spaces.count()).toBe(0);
    expect(await db.collections.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);

    await repo.restoreDeletion(deletion);
    expect(await db.spaces.get(space.id)).toMatchObject({ name: 'Work', position: space.position });
    expect((await db.collections.orderBy('position').toArray()).map((x) => x.id)).toEqual([col.id, other.id]);
    expect(await db.cards.count()).toBe(cards.length + 1);
    expect((await counts()).deleted).toBeUndefined();
  });

  it('refuses to restore a link whose collection is gone', async () => {
    const { col, cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const deletion = await repo.deleteCard(a.id);
    await repo.deleteCollection(col.id);
    await expect(repo.restoreDeletion(deletion)).rejects.toThrow('collection no longer exists');
  });
});

describe('undo: tags and hashtags', () => {
  it('restores a tag and puts it back on collections and links', async () => {
    const { col, cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const tag = await repo.createTag('Keep', '#0d9488');
    await repo.setCollectionTags(col.id, [tag.id]);
    await repo.setCardLabels(a.id, { tagIds: [tag.id], hashtagIds: [] });

    const deletion = await repo.deleteTag(tag.id);
    expect((await db.collections.get(col.id))?.tagIds).toEqual([]);
    expect((await db.cards.get(a.id))?.tagIds).toEqual([]);

    await repo.restoreDeletion(deletion);
    expect(await db.tags.get(tag.id)).toMatchObject({ title: 'Keep', color: '#0d9488', position: tag.position });
    expect((await db.collections.get(col.id))?.tagIds).toEqual([tag.id]);
    expect((await db.cards.get(a.id))?.tagIds).toEqual([tag.id]);
  });

  it('keeps labels added between delete and undo', async () => {
    const { col, cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const tag = await repo.createTag('Keep', '#0d9488');
    const other = await repo.createTag('Other', '#ea580c');
    await repo.setCollectionTags(col.id, [tag.id]);
    await repo.setCardLabels(a.id, { tagIds: [tag.id], hashtagIds: [] });

    const deletion = await repo.deleteTag(tag.id);
    // A different tag is added while the undo toast is still up.
    await repo.setCardLabels(a.id, { tagIds: [other.id], hashtagIds: [] });
    await repo.setCollectionTags(col.id, [other.id]);

    await repo.restoreDeletion(deletion);
    expect((await db.cards.get(a.id))?.tagIds).toEqual([tag.id, other.id]);
    expect((await db.collections.get(col.id))?.tagIds).toEqual([tag.id, other.id]);
  });

  it('drops restored label ids whose tag or hashtag was deleted after the snapshot', async () => {
    const { cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const tag = await repo.createTag('Gone', '#0d9488');
    const hashtag = await repo.ensureHashtag('gone');
    await repo.setCardLabels(a.id, { tagIds: [tag.id], hashtagIds: [hashtag.id] });

    const deletion = await repo.deleteCard(a.id);
    await repo.deleteTag(tag.id);
    await repo.deleteHashtag(hashtag.id);
    await repo.restoreDeletion(deletion);
    expect((await db.cards.get(a.id))?.tagIds).toEqual([]);
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([]);
  });

  it('restores a hashtag and puts it back on the links', async () => {
    const { cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const hashtag = await repo.ensureHashtag('read');
    await repo.setCardLabels(a.id, { tagIds: [], hashtagIds: [hashtag.id] });

    const deletion = await repo.deleteHashtag(hashtag.id);
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([]);

    await repo.restoreDeletion(deletion);
    expect(await db.hashtags.get(hashtag.id)).toMatchObject({ name: 'read' });
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([hashtag.id]);
  });

  it('points restored links at the live hashtag when the name was recreated', async () => {
    const { cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const hashtag = await repo.ensureHashtag('read');
    await repo.setCardLabels(a.id, { tagIds: [], hashtagIds: [hashtag.id] });

    const deletion = await repo.deleteHashtag(hashtag.id);
    const recreated = await repo.ensureHashtag('read');
    expect(recreated.id).not.toBe(hashtag.id);

    await repo.restoreDeletion(deletion);
    expect(await db.hashtags.count()).toBe(1);
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([recreated.id]);
  });

  it('un-does a merge: the hashtag is back and links carry it again', async () => {
    const { cards } = await seed();
    const [a] = cards;
    if (!a) throw new Error('card was not added');
    const from = await repo.ensureHashtag('from');
    const into = await repo.ensureHashtag('into');
    await repo.setCardLabels(a.id, { tagIds: [], hashtagIds: [from.id] });

    const deletion = await repo.mergeHashtag(from.id, into.id);
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([into.id]);

    await repo.restoreDeletion(deletion);
    expect(await db.hashtags.get(from.id)).toMatchObject({ name: 'from' });
    expect((await db.cards.get(a.id))?.hashtagIds).toEqual([from.id]);
  });

  it('restores unused tags and hashtags', async () => {
    const tag = await repo.createTag('Spare', '#6366f1');
    const hashtag = await repo.ensureHashtag('spare');

    const tagsDeletion = await repo.deleteUnusedTags();
    const hashtagsDeletion = await repo.deleteUnusedHashtags();
    expect(await db.tags.count()).toBe(0);
    expect(await db.hashtags.count()).toBe(0);

    await repo.restoreDeletion(tagsDeletion);
    await repo.restoreDeletion(hashtagsDeletion);
    expect(await db.tags.get(tag.id)).toMatchObject({ title: 'Spare' });
    expect(await db.hashtags.get(hashtag.id)).toMatchObject({ name: 'spare' });
  });
});
