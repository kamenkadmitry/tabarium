import type { TabariumDB } from './db';
import { Repository, type NewCard } from './repo';
import { loadSettings, updateSettings } from './settings';

export const INBOX_SPACE = 'Inbox';
export const INBOX_COLLECTION = 'Saved tabs';

/**
 * Resolves where quick saves (popup, side panel, context menu) go: the remembered collection if it still
 * exists, otherwise an "Inbox / Saved tabs" collection that is created on demand.
 */
export async function resolveQuickTarget(db: TabariumDB): Promise<string> {
  const { quickSaveCollectionId } = await loadSettings(db);
  if (quickSaveCollectionId && (await db.collections.get(quickSaveCollectionId))) return quickSaveCollectionId;

  const repo = new Repository(db);
  const space = (await db.spaces.toArray()).find((s) => s.name === INBOX_SPACE) ?? (await repo.createSpace(INBOX_SPACE));
  const existing = (await db.collections.where('spaceId').equals(space.id).toArray()).find(
    (c) => c.title === INBOX_COLLECTION,
  );
  const collection = existing ?? (await repo.createCollection(space.id, INBOX_COLLECTION));
  await updateSettings(db, { quickSaveCollectionId: collection.id });
  return collection.id;
}

/** Saves cards into the quick-save target and returns how many were new. */
export async function quickSave(db: TabariumDB, items: readonly NewCard[]): Promise<number> {
  const collectionId = await resolveQuickTarget(db);
  return (await new Repository(db).addCards(collectionId, items)).length;
}

export async function setQuickTarget(db: TabariumDB, collectionId: string): Promise<void> {
  if (!(await db.collections.get(collectionId))) throw new Error(`Collection ${collectionId} does not exist`);
  await updateSettings(db, { quickSaveCollectionId: collectionId });
}
