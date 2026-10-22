import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { normalizeHashtag } from '../src/core/hashtag';
import { applyCardDetails, applyGroups, loadLabelContext, loadLibraryContext } from '../src/core/organise';
import { ensureInbox } from '../src/core/quicksave';
import { Repository } from '../src/core/repo';
import { ALL_ICON_KEYS, ICON_GROUPS } from '../src/ui/spaceIcons';

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

describe('managing many labels', () => {
  it('merges a hashtag into another without duplicates and removes the first', async () => {
    const { card } = await oneCard();
    const a = await repo.ensureHashtag('ml');
    const b = await repo.ensureHashtag('machine-learning');
    await repo.setCardLabels(card.id, { tagIds: [], hashtagIds: [a.id, b.id] });
    await repo.mergeHashtag(a.id, b.id);
    expect((await db.cards.get(card.id))?.hashtagIds).toEqual([b.id]);
    expect(await db.hashtags.get(a.id)).toBeUndefined();
    await expect(repo.mergeHashtag(b.id, b.id)).rejects.toThrow('different hashtag');
    await expect(repo.mergeHashtag('nope', b.id)).rejects.toThrow('does not exist');
  });

  it('deletes only unused hashtags and tags', async () => {
    const { col, card } = await oneCard();
    const used = await repo.ensureHashtag('used');
    await repo.ensureHashtag('spare');
    const usedTag = await repo.createTag('OnCard', '#0d9488');
    const collTag = await repo.createTag('OnCollection', '#ea580c');
    await repo.createTag('Spare', '#6366f1');
    await repo.setCardLabels(card.id, { tagIds: [usedTag.id], hashtagIds: [used.id] });
    await repo.setCollectionTags(col.id, [collTag.id]);

    expect(await repo.deleteUnusedHashtags()).toEqual({ kind: 'hashtags', hashtags: [expect.objectContaining({ name: 'spare' })] });
    expect((await db.hashtags.toArray()).map((h) => h.name)).toEqual(['used']);
    expect(await repo.deleteUnusedTags()).toEqual({ kind: 'tags', tags: [expect.objectContaining({ title: 'Spare' })] });
    expect((await db.tags.orderBy('position').toArray()).map((t) => t.title)).toEqual(['OnCard', 'OnCollection']);
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

describe('applying suggested details', () => {
  it('adds labels, fills only an empty note and reports how many links changed', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    const [a, b] = await repo.addCards(col.id, [
      { title: 'A', url: 'https://a.dev/' },
      { title: 'B', url: 'https://b.dev/', note: 'mine' },
    ]);
    if (!a || !b) throw new Error('cards were not added');
    const work = await repo.createTag('Work', '#0d9488');
    const keep = await repo.ensureHashtag('keep');
    await repo.setCardLabels(b.id, { tagIds: [], hashtagIds: [keep.id] });

    expect(await loadLabelContext(db)).toEqual({ tags: ['Work'], hashtags: ['keep'], collections: [{ space: 'S', title: 'C' }] });
    const changed = await applyCardDetails(db, repo, [
      { cardId: a.id, note: 'About A', tags: ['work'], hashtags: ['new'] },
      { cardId: b.id, note: 'Replaced?', tags: [], hashtags: ['keep'] },
    ], { tagColors: ['#0d9488'], move: false });

    expect(changed).toBe(1);
    const afterA = await db.cards.get(a.id);
    expect(afterA?.note).toBe('About A');
    expect(afterA?.tagIds).toEqual([work.id]);
    expect(afterA?.hashtagIds).toHaveLength(1);
    const afterB = await db.cards.get(b.id);
    expect(afterB?.note).toBe('mine');
    expect(afterB?.hashtagIds).toEqual([keep.id]);
  });
});

describe('applying suggestions that create tags and move links', () => {
  it('creates a missing tag and hashtags, and moves a link to its collection (or drops the duplicate)', async () => {
    const work = await repo.createSpace('Work');
    const reading = await repo.createCollection(work.id, 'Reading');
    await repo.addCards(reading.id, [{ title: 'Already here', url: 'https://dup.dev/' }]);
    const { space } = await ensureInbox(db);
    const inbox = await repo.createCollection(space.id, 'Waiting');
    const [fresh, dup] = await repo.addCards(inbox.id, [
      { title: 'Fresh', url: 'https://fresh.dev/' },
      { title: 'Dup', url: 'https://dup.dev' },
    ]);
    if (!fresh || !dup) throw new Error('cards were not added');

    const changed = await applyCardDetails(
      db,
      repo,
      [
        { cardId: fresh.id, note: 'About it', tags: ['Brand new'], hashtags: ['x', 'y'], destination: { space: 'work', collection: 'Brand new place' } },
        { cardId: dup.id, note: '', tags: [], hashtags: [], destination: { space: 'Work', collection: 'reading' } },
      ],
      { tagColors: ['#0d9488', '#ea580c'], move: true },
    );

    expect(changed).toBe(2);
    expect((await db.tags.toArray()).map((t) => t.title)).toEqual(['Brand new']);
    const moved = await db.cards.get(fresh.id);
    expect(moved?.hashtagIds).toHaveLength(2);
    expect(moved?.tagIds).toHaveLength(1);
    const place = (await db.collections.where('spaceId').equals(work.id).toArray()).find((c) => c.title === 'Brand new place');
    expect(moved?.collectionId).toBe(place?.id);
    expect(await db.cards.get(dup.id)).toBeUndefined(); // it was already in Reading
    // Without `move` nothing is moved.
    const [again] = await repo.addCards(inbox.id, [{ title: 'Stay', url: 'https://stay.dev/' }]);
    await applyCardDetails(db, repo, [{ cardId: again?.id ?? '', note: '', tags: [], hashtags: ['z'], destination: { space: 'Work', collection: 'Reading' } }], { tagColors: ['#0d9488'], move: false });
    expect((await db.cards.get(again?.id ?? ''))?.collectionId).toBe(inbox.id);
  });
});

describe('space icons', () => {
  it('stores an icon with a space, changes it with the name, and keeps it in backups', async () => {
    const space = await repo.createSpace('Code', 'brand:github');
    expect(space.icon).toBe('brand:github');
    expect((await repo.createSpace('Plain')).icon).toBeNull();
    await repo.updateSpace(space.id, { name: ' Cloud stuff ', icon: 'lucide:cloud' });
    expect(await db.spaces.get(space.id)).toMatchObject({ name: 'Cloud stuff', icon: 'lucide:cloud' });
    await expect(repo.updateSpace(space.id, { name: '  ', icon: null })).rejects.toThrow('needs a name');
    await expect(repo.updateSpace('nope', { name: 'x', icon: null })).rejects.toThrow('does not exist');

    const backup = await exportBackup(db);
    await restoreBackup(db, parseBackup(JSON.stringify(backup)));
    expect((await db.spaces.get(space.id))?.icon).toBe('lucide:cloud');

    const legacy = JSON.parse(JSON.stringify(backup)) as { spaces: Record<string, unknown>[] };
    for (const s of legacy.spaces) delete s.icon;
    expect(parseBackup(JSON.stringify(legacy)).spaces.every((s) => s.icon === null)).toBe(true);
  });

  it('offers unique icon keys in every group', () => {
    expect(new Set(ALL_ICON_KEYS).size).toBe(ALL_ICON_KEYS.length);
    expect(ICON_GROUPS.map((g) => g.title)).toContain('Brands');
    expect(ALL_ICON_KEYS).toContain('brand:github');
    expect(ALL_ICON_KEYS).toContain('lucide:cloud');
  });
});
