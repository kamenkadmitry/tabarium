import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { normalizeHashtag } from '../src/core/hashtag';
import { applyGroups, loadLibraryContext } from '../src/core/organise';
import { Repository } from '../src/core/repo';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

async function oneCard() {
  const space = await repo.createSpace('S');
  const col = await repo.createCollection(space.id, 'C');
  const [card] = await repo.addCards(col.id, [{ title: 'A', url: 'https://a.dev/' }]);
  if (!card) throw new Error('card was not added');
  return { space, col, card };
}

describe('hashtags', () => {
  it('normalises user input', () => {
    expect(normalizeHashtag('  #Machine Learning ')).toBe('machine-learning');
    expect(normalizeHashtag('C++')).toBe('c');
    expect(normalizeHashtag('Привет Мир')).toBe('привет-мир');
    expect(normalizeHashtag('###')).toBe('');
  });

  it('ensureHashtag reuses an existing name and rejects empty ones', async () => {
    const a = await repo.ensureHashtag('#AI');
    const b = await repo.ensureHashtag('ai');
    expect(b.id).toBe(a.id);
    await expect(repo.ensureHashtag('###')).rejects.toThrow('not a valid hashtag');
  });

  it('rename refuses a clash; delete removes the hashtag from cards', async () => {
    const { card } = await oneCard();
    const ai = await repo.ensureHashtag('ai');
    const rust = await repo.ensureHashtag('rust');
    await expect(repo.renameHashtag(rust.id, 'AI')).rejects.toThrow('already exists');
    await repo.setCardLabels(card.id, { tagIds: [], hashtagIds: [ai.id, rust.id] });
    await repo.deleteHashtag(ai.id);
    expect((await db.cards.get(card.id))?.hashtagIds).toEqual([rust.id]);
  });

  it('deleting a tag removes it from collections and cards', async () => {
    const { col, card } = await oneCard();
    const tag = await repo.createTag('Work', '#0d9488');
    await repo.setCollectionTags(col.id, [tag.id]);
    await repo.setCardLabels(card.id, { tagIds: [tag.id], hashtagIds: [] });
    await repo.deleteTag(tag.id);
    expect((await db.cards.get(card.id))?.tagIds).toEqual([]);
    expect((await db.collections.get(col.id))?.tagIds).toEqual([]);
  });

  it('setCardLabels rejects unknown ids', async () => {
    const { card } = await oneCard();
    await expect(repo.setCardLabels(card.id, { tagIds: ['nope'], hashtagIds: [] })).rejects.toThrow('does not exist');
  });

  it('backup round-trips tags and hashtags on cards, and old backups without them still load', async () => {
    const { card } = await oneCard();
    const tag = await repo.createTag('Work', '#0d9488');
    const hash = await repo.ensureHashtag('ai');
    await repo.setCardLabels(card.id, { tagIds: [tag.id], hashtagIds: [hash.id] });

    const backup = await exportBackup(db);
    await restoreBackup(db, parseBackup(JSON.stringify(backup)));
    expect((await db.cards.toArray())[0]).toMatchObject({ tagIds: [tag.id], hashtagIds: [hash.id] });
    expect(await db.hashtags.count()).toBe(1);

    const legacy = JSON.parse(JSON.stringify(backup)) as { hashtags?: unknown; cards: Record<string, unknown>[] };
    delete legacy.hashtags;
    for (const c of legacy.cards) {
      delete c.tagIds;
      delete c.hashtagIds;
    }
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.hashtags).toEqual([]);
    expect(parsed.cards[0]).toMatchObject({ tagIds: [], hashtagIds: [] });
  });
});

describe('AI organising helpers', () => {
  it('loads the existing collections of the space, tags and hashtags', async () => {
    const space = await repo.createSpace('S');
    const other = await repo.createSpace('Other');
    await repo.createCollection(space.id, 'Reading');
    await repo.createCollection(other.id, 'Elsewhere');
    await repo.createTag('Work', '#0d9488');
    await repo.ensureHashtag('ai');
    expect(await loadLibraryContext(db, space.id)).toEqual({ collections: ['Reading'], tags: ['Work'], hashtags: ['ai'] });
  });

  it('applyGroups reuses a collection with the same title, adds tags to it and hashtags to cards', async () => {
    const space = await repo.createSpace('S');
    const reading = await repo.createCollection(space.id, 'Reading');
    const tag = await repo.createTag('Work', '#0d9488');

    const result = await applyGroups(db, repo, space.id, [
      { title: 'reading', cards: [{ title: 'A', url: 'https://a.dev/' }], tags: ['work'], hashtags: ['ai'] },
      { title: 'Fresh', cards: [{ title: 'B', url: 'https://b.dev/' }], hashtags: ['ai', 'rust'] },
    ]);
    expect(result).toEqual({ collections: 2, created: 1, cards: 2 });
    expect(await db.collections.count()).toBe(2);
    expect((await db.collections.get(reading.id))?.tagIds).toEqual([tag.id]);
    const ai = await db.hashtags.where('name').equals('ai').first();
    expect((await db.cards.where('collectionId').equals(reading.id).toArray())[0]?.hashtagIds).toEqual([ai?.id]);
    expect(await db.hashtags.count()).toBe(2);
  });
});
