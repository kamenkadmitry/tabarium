import type { TabariumDB } from './db';
import { type NewCard, Repository } from './repo';
import { loadSettings, updateSettings } from './settings';
import type { Card, Collection, Space } from './types';

export const INBOX_SPACE = 'Inbox';
export const INBOX_COLLECTION = 'Saved tabs';
/** The Inbox always shows an envelope; its icon cannot be changed. */
export const INBOX_ICON = 'lucide:mail';

/** The system space where links wait to be sorted. There is only one; it cannot be renamed, edited or deleted. */
export const inboxSpace = (spaces: readonly Space[]): Space | undefined => spaces.find((s) => s.kind === 'inbox');

/** Links that are in the Inbox space, whichever of its collections they sit in. */
export function inboxCards(spaces: readonly Space[], collections: readonly Collection[], cards: readonly Card[]): Card[] {
  const space = inboxSpace(spaces);
  if (!space) return [];
  const ids = new Set(collections.filter((c) => c.spaceId === space.id).map((c) => c.id));
  return cards.filter((c) => ids.has(c.collectionId));
}

/**
 * Makes sure the Inbox exists and returns it with its default collection ("Saved tabs").
 *
 * Data made before the Inbox became a system space has a plain space holding a "Saved tabs" collection, possibly renamed,
 * possibly with a second "Inbox" space that was created by mistake after the rename. The oldest such space becomes the
 * Inbox (named and decorated as such) and the accidental copies are merged into it.
 *
 * Everything happens in one transaction, so surfaces that start at the same time (library, side panel, worker) end up
 * with exactly one Inbox.
 */
export async function ensureInbox(db: TabariumDB): Promise<{ space: Space; collection: Collection }> {
  return db.transaction('rw', db.spaces, db.collections, db.cards, async () => {
    const repo = new Repository(db);
    let space = (await db.spaces.toArray()).find((s) => s.kind === 'inbox');

    if (!space) {
      const spaces = await db.spaces.toArray();
      const collections = await db.collections.toArray();
      const holding = spaces.filter((s) => collections.some((c) => c.spaceId === s.id && c.title === INBOX_COLLECTION));
      // The oldest one (lowest position) is the original; later ones are copies made after it was renamed.
      const counted = holding.map((sp) => ({ space: sp })).sort((x, y) => x.space.position - y.space.position);
      const [primary, ...others] = counted;

      if (primary) {
        await db.spaces.update(primary.space.id, { kind: 'inbox', name: INBOX_SPACE, icon: INBOX_ICON });
        const adopted: Space = { ...primary.space, kind: 'inbox', name: INBOX_SPACE, icon: INBOX_ICON };
        space = adopted;
        const target =
          collections.find((c) => c.spaceId === adopted.id && c.title === INBOX_COLLECTION) ?? (await repo.createCollection(adopted.id, INBOX_COLLECTION));
        for (const { space: dup } of others) {
          const own = collections.filter((c) => c.spaceId === dup.id);
          // Only spaces that look like the accidental copy ("Inbox" holding nothing but "Saved tabs") are merged.
          if (dup.name !== INBOX_SPACE || own.some((c) => c.title !== INBOX_COLLECTION)) continue;
          const ids = (await db.cards.where('collectionId').anyOf(own.map((c) => c.id)).toArray()).map((c) => c.id);
          if (ids.length > 0) await repo.moveCards(ids, target.id);
          await db.collections.bulkDelete(own.map((c) => c.id));
          await db.spaces.delete(dup.id);
        }
      } else {
        space = await repo.createSpace(INBOX_SPACE, INBOX_ICON, 'inbox');
      }
    }

    const own = await db.collections.where('spaceId').equals(space.id).sortBy('position');
    const collection = own.find((c) => c.title === INBOX_COLLECTION) ?? own[0] ?? (await repo.createCollection(space.id, INBOX_COLLECTION));
    return { space, collection };
  });
}

/** The default collection of the Inbox, created if needed. */
export async function resolveInbox(db: TabariumDB): Promise<string> {
  return (await ensureInbox(db)).collection.id;
}

/** Saves links into the Inbox. Returns how many were new. */
export async function saveToInbox(db: TabariumDB, items: readonly NewCard[]): Promise<number> {
  return (await new Repository(db).addCards(await resolveInbox(db), items)).length;
}

/** Moves links into the Inbox, from wherever they are. */
export async function moveToInbox(db: TabariumDB, cardIds: readonly string[]): Promise<void> {
  await new Repository(db).moveCards(cardIds, await resolveInbox(db));
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
