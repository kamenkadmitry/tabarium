import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { findInbox, INBOX_COLLECTION, INBOX_SPACE, quickSave, resolveInbox, resolveQuickTarget, saveToInbox, setQuickTarget } from '../src/core/quicksave';
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

  it('is found by name without creating anything', async () => {
    expect(findInbox(await db.spaces.toArray(), await db.collections.toArray())).toBeUndefined();
    const id = await resolveInbox(db);
    expect(findInbox(await db.spaces.toArray(), await db.collections.toArray())?.id).toBe(id);
  });
});
