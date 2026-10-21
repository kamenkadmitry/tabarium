import type { TabariumDB } from './db';
import type { Collection, Space } from './types';
import { Repository, type NewCard } from './repo';
import { loadSettings, updateSettings } from './settings';

export const INBOX_SPACE = 'Inbox';
export const INBOX_COLLECTION = 'Saved tabs';

/** The Inbox collection ("Inbox / Saved tabs") among existing data, or undefined when it was never created. */
export function findInbox(spaces: readonly Space[], collections: readonly Collection[]): Collection | undefined {
  const space = spaces.find((s) => s.name === INBOX_SPACE);
  return space ? collections.find((c) => c.spaceId === space.id && c.title === INBOX_COLLECTION) : undefined;
}

/**
 * The Inbox collection, created on demand. It is the collection the side panel's Inbox tab lists: unlike the
 * remembered quick-save target it never moves to another collection.
 */
export async function resolveInbox(db: TabariumDB): Promise<string> {
  const repo = new Repository(db);
  const spaces = await db.spaces.toArray();
  const space = spaces.find((s) => s.name === INBOX_SPACE) ?? (await repo.createSpace(INBOX_SPACE));
  const existing = (await db.collections.where('spaceId').equals(space.id).toArray()).find((c) => c.title === INBOX_COLLECTION);
  return (existing ?? (await repo.createCollection(space.id, INBOX_COLLECTION))).id;
}

/** Saves links into the Inbox. Returns how many were new. */
export async function saveToInbox(db: TabariumDB, items: readonly NewCard[]): Promise<number> {
  return (await new Repository(db).addCards(await resolveInbox(db), items)).length;
}

/**
 * Resolves where quick saves (popup, side panel, context menu) go: the remembered collection if it still
 * exists, otherwise the Inbox.
 */
export async function resolveQuickTarget(db: TabariumDB): Promise<string> {
  const { quickSaveCollectionId } = await loadSettings(db);
  if (quickSaveCollectionId && (await db.collections.get(quickSaveCollectionId))) return quickSaveCollectionId;
  const collectionId = await resolveInbox(db);
  await updateSettings(db, { quickSaveCollectionId: collectionId });
  return collectionId;
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
