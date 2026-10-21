import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { ensureInbox, inboxCards, inboxSpace, INBOX_COLLECTION, INBOX_ICON, INBOX_SPACE, moveToInbox, quickSave, resolveInbox, resolveQuickTarget, saveToInbox, setQuickTarget } from '../src/core/quicksave';
import { Repository } from '../src/core/repo';
import { loadSettings } from '../src/core/settings';

let db: TabariumDB;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
});

describe('quick save', () => {
  it('creates an Inbox collection on first use and reuses it', async () => {
    const first = await resolveQuickTarget(db);
    expect(await resolveQuickTarget(db)).toBe(first);
    expect((await db.spaces.toArray()).map((s) => s.name)).toEqual([INBOX_SPACE]);
    expect((await db.collections.get(first))?.title).toBe(INBOX_COLLECTION);
  });

  it('saves and skips duplicates', async () => {
    expect(await quickSave(db, [{ title: 'A', url: 'https://a.dev/' }])).toBe(1);
    expect(await quickSave(db, [{ title: 'A', url: 'https://a.dev' }, { title: 'B', url: 'https://b.dev' }])).toBe(1);
    expect(await db.cards.count()).toBe(2);
  });

  it('honours a chosen target and recovers if it was deleted', async () => {
    const repo = new Repository(db);
    const space = await repo.createSpace('Work');
    const col = await repo.createCollection(space.id, 'Reading');
    await setQuickTarget(db, col.id);
    await quickSave(db, [{ title: 'A', url: 'https://a.dev/' }]);
    expect((await db.cards.toArray())[0]?.collectionId).toBe(col.id);

    await repo.deleteCollection(col.id);
    const fallback = await resolveQuickTarget(db);
    expect(fallback).not.toBe(col.id);
    expect((await loadSettings(db)).quickSaveCollectionId).toBe(fallback);
  });

  it('rejects an unknown target', async () => {
    await expect(setQuickTarget(db, 'nope')).rejects.toThrow(/does not exist/);
  });
});

describe('settings schema evolution', () => {
  it('accepts a record saved before new fields existed', async () => {
    await db.settings.put({
      key: 'settings',
      value: {
        theme: 'dark',
        autoBackup: { enabled: false, intervalHours: 24 },
        lastBackupAt: null,
        ai: { provider: null, model: '', baseUrl: '', apiKey: '' },
      },
    });
    const s = await loadSettings(db);
    expect(s.theme).toBe('dark');
    expect(s.contextMenu).toBe(false);
    expect(s.quickSaveCollectionId).toBeNull();
  });
});

describe('Inbox', () => {
  it('is one system space with an envelope that cannot be renamed, edited or deleted', async () => {
    const repo = new Repository(db);
    const { space, collection } = await ensureInbox(db);
    expect(space).toMatchObject({ name: INBOX_SPACE, kind: 'inbox', icon: INBOX_ICON });
    expect(collection.title).toBe(INBOX_COLLECTION);
    expect((await ensureInbox(db)).space.id).toBe(space.id); // asking again finds it

    await expect(repo.renameSpace(space.id, 'Mine')).rejects.toThrow('system space');
    await expect(repo.updateSpace(space.id, { name: 'Mine', icon: null })).rejects.toThrow('system space');
    await expect(repo.deleteSpace(space.id)).rejects.toThrow('system space');
    expect(await db.spaces.get(space.id)).toMatchObject({ name: INBOX_SPACE });
  });

  it('is created once even when several surfaces ask at the same moment', async () => {
    const ids = await Promise.all([ensureInbox(db), ensureInbox(db), ensureInbox(db)]);
    expect(new Set(ids.map((i) => i.space.id)).size).toBe(1);
    expect(await db.spaces.count()).toBe(1);
  });

  it('stays the same collection when the quick target moves elsewhere', async () => {
    const repo = new Repository(db);
    const inbox = await resolveInbox(db);
    const space = await repo.createSpace('Work');
    const col = await repo.createCollection(space.id, 'Reading');
    await setQuickTarget(db, col.id);

    expect(await resolveInbox(db)).toBe(inbox);
    expect(await saveToInbox(db, [{ title: 'A', url: 'https://a.dev/' }])).toBe(1);
    expect(await saveToInbox(db, [{ title: 'A', url: 'https://a.dev' }])).toBe(0);
    expect((await db.cards.where('collectionId').equals(inbox).toArray()).map((c) => c.title)).toEqual(['A']);
    expect(await db.cards.where('collectionId').equals(col.id).count()).toBe(0);
  });

  it('lists the links of all its collections and takes links in from elsewhere', async () => {
    const repo = new Repository(db);
    const { space } = await ensureInbox(db);
    const extra = await repo.createCollection(space.id, 'Second');
    const other = await repo.createSpace('Work');
    const work = await repo.createCollection(other.id, 'Reading');
    const [a] = await repo.addCards(extra.id, [{ title: 'In second', url: 'https://a.dev/' }]);
    const [b] = await repo.addCards(work.id, [{ title: 'Elsewhere', url: 'https://b.dev/' }]);
    if (!a || !b) throw new Error('cards were not added');

    const read = async () => inboxCards(await db.spaces.toArray(), await db.collections.toArray(), await db.cards.toArray()).map((c) => c.title).sort();
    expect(await read()).toEqual(['In second']);
    await moveToInbox(db, [b.id]);
    expect(await read()).toEqual(['Elsewhere', 'In second']);
    expect(inboxSpace(await db.spaces.toArray())?.id).toBe(space.id);
  });

  it('adopts the old plain Inbox (even renamed) and merges the empty copy that was created after the rename', async () => {
    const repo = new Repository(db);
    // What the owner had: the original Inbox renamed to "Входящие", then an empty "Inbox" made by mistake.
    const renamed = await repo.createSpace('Входящие');
    const old = await repo.createCollection(renamed.id, INBOX_COLLECTION);
    await repo.addCards(old.id, [{ title: 'Kept', url: 'https://kept.dev/' }]);
    const copy = await repo.createSpace('Inbox');
    const copyCol = await repo.createCollection(copy.id, INBOX_COLLECTION);
    await repo.addCards(copyCol.id, [{ title: 'From the copy', url: 'https://copy.dev/' }]);
    const work = await repo.createSpace('Work');
    await repo.createCollection(work.id, 'Reading');

    const { space, collection } = await ensureInbox(db);
    expect(space.id).toBe(renamed.id);
    expect(space).toMatchObject({ name: INBOX_SPACE, kind: 'inbox', icon: INBOX_ICON });
    expect(collection.id).toBe(old.id);
    expect((await db.cards.where('collectionId').equals(old.id).toArray()).map((c) => c.title).sort()).toEqual(['From the copy', 'Kept']);
    expect(await db.spaces.get(copy.id)).toBeUndefined();
    expect(await db.collections.get(copyCol.id)).toBeUndefined();
    expect((await db.spaces.toArray()).map((s) => s.name).sort()).toEqual(['Inbox', 'Work']);
  });
});
