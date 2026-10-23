import { unbumpActivity } from './activity';
import type { TabariumDB } from './db';
import type { Card, Collection, Hashtag, Space, Tag } from './types';

/**
 * What a delete removed, kept in memory for the few seconds the undo toast is up.
 * Restoring writes the rows back verbatim: same ids, positions, labels and timestamps.
 */
export type Deletion =
  | { kind: 'cards'; cards: Card[]; duplicates: boolean }
  | { kind: 'collection'; collection: Collection; cards: Card[] }
  | { kind: 'space'; space: Space; collections: Collection[]; cards: Card[] }
  | { kind: 'tag'; tag: Tag; collections: { id: string; tagIds: string[] }[]; cards: { id: string; tagIds: string[] }[] }
  | { kind: 'hashtag'; hashtag: Hashtag; cards: { id: string; hashtagIds: string[] }[]; /** Set by mergeHashtag: the id the links were moved to; restoring drops it again. */ mergedInto?: string }
  | { kind: 'tags'; tags: Tag[] }
  | { kind: 'hashtags'; hashtags: Hashtag[] };

/**
 * Puts back what a delete returned. Rows come back verbatim (same ids, positions, timestamps);
 * label ids that no longer point at a live tag or hashtag are dropped so references never dangle.
 * References recorded by a label delete are merged back: labels added since the delete are kept
 * (for an undone merge the merge target drops out again), and items deleted since are skipped.
 * Throws when a parent needed by the restored rows no longer exists.
 */
export async function restoreDeletion(db: TabariumDB, d: Deletion): Promise<void> {
  switch (d.kind) {
    case 'cards':
      await db.transaction('rw', [db.cards, db.collections, db.activity, db.tags, db.hashtags], async () => {
        const parents = await db.collections.bulkGet([...new Set(d.cards.map((c) => c.collectionId))]);
        if (parents.some((c) => !c)) throw new Error('Cannot undo: the collection no longer exists.');
        const live = await liveLabelIds(db);
        await db.cards.bulkAdd(d.cards.map((c) => pruneLabels(c, live)));
        await unbumpActivity(db, 'deleted', d.cards.length);
        if (d.duplicates) await unbumpActivity(db, 'duplicates-removed', d.cards.length);
      });
      return;
    case 'collection':
      await db.transaction('rw', [db.collections, db.spaces, db.cards, db.activity, db.tags, db.hashtags], async () => {
        if (!(await db.spaces.get(d.collection.spaceId))) throw new Error('Cannot undo: the space no longer exists.');
        const live = await liveLabelIds(db);
        await db.collections.add({ ...d.collection, tagIds: d.collection.tagIds.filter((t) => live.tags.has(t)) });
        await db.cards.bulkAdd(d.cards.map((c) => pruneLabels(c, live)));
        await unbumpActivity(db, 'deleted', d.cards.length);
      });
      return;
    case 'space':
      await db.transaction('rw', [db.spaces, db.collections, db.cards, db.activity, db.tags, db.hashtags], async () => {
        const live = await liveLabelIds(db);
        await db.spaces.add(d.space);
        await db.collections.bulkAdd(d.collections.map((c) => ({ ...c, tagIds: c.tagIds.filter((t) => live.tags.has(t)) })));
        await db.cards.bulkAdd(d.cards.map((c) => pruneLabels(c, live)));
        await unbumpActivity(db, 'deleted', d.cards.length);
      });
      return;
    case 'tag':
      await db.transaction('rw', db.tags, db.collections, db.cards, async () => {
        await db.tags.add(d.tag);
        const live = new Set(await db.tags.toCollection().primaryKeys());
        const collections = new Map((await db.collections.bulkGet(d.collections.map((c) => c.id))).flatMap((c) => (c ? [[c.id, c] as const] : [])));
        for (const prev of d.collections) {
          const current = collections.get(prev.id);
          if (current) await db.collections.update(prev.id, { tagIds: mergeLive(prev.tagIds, current.tagIds, live) });
        }
        const cards = new Map((await db.cards.bulkGet(d.cards.map((c) => c.id))).flatMap((c) => (c ? [[c.id, c] as const] : [])));
        for (const prev of d.cards) {
          const current = cards.get(prev.id);
          if (current) await db.cards.update(prev.id, { tagIds: mergeLive(prev.tagIds, current.tagIds, live) });
        }
      });
      return;
    case 'hashtag':
      await db.transaction('rw', db.hashtags, db.cards, async () => {
        // The hashtag name is unique: when it was recreated since the delete, point the links at the live row.
        const clash = await db.hashtags.where('name').equals(d.hashtag.name).first();
        const liveId = clash ? clash.id : d.hashtag.id;
        if (!clash) await db.hashtags.add(d.hashtag);
        const live = new Set(await db.hashtags.toCollection().primaryKeys());
        const cards = new Map((await db.cards.bulkGet(d.cards.map((c) => c.id))).flatMap((c) => (c ? [[c.id, c] as const] : [])));
        for (const prev of d.cards) {
          const current = cards.get(prev.id);
          if (!current) continue;
          const restored = prev.hashtagIds.map((h) => (h === d.hashtag.id ? liveId : h));
          const kept = current.hashtagIds.filter((h) => h !== d.mergedInto);
          await db.cards.update(prev.id, { hashtagIds: mergeLive(restored, kept, live) });
        }
      });
      return;
    case 'tags':
      await db.transaction('rw', db.tags, () => db.tags.bulkAdd(d.tags));
      return;
    case 'hashtags':
      await db.transaction('rw', db.hashtags, async () => {
        const existing = new Set((await db.hashtags.toArray()).map((h) => h.name));
        await db.hashtags.bulkAdd(d.hashtags.filter((h) => !existing.has(h.name)));
      });
      return;
  }
}

interface LiveLabelIds {
  tags: ReadonlySet<string>;
  hashtags: ReadonlySet<string>;
}

async function liveLabelIds(db: TabariumDB): Promise<LiveLabelIds> {
  return {
    tags: new Set(await db.tags.toCollection().primaryKeys()),
    hashtags: new Set(await db.hashtags.toCollection().primaryKeys()),
  };
}

/** A restored row's label ids, minus any that no longer point at a live tag or hashtag. */
function pruneLabels(card: Card, live: LiveLabelIds): Card {
  return {
    ...card,
    tagIds: card.tagIds.filter((t) => live.tags.has(t)),
    hashtagIds: card.hashtagIds.filter((h) => live.hashtags.has(h)),
  };
}

/** Snapshot ids first, then ids added since, deduped and limited to what still exists. */
function mergeLive(previous: readonly string[], current: readonly string[], live: ReadonlySet<string>): string[] {
  return [...new Set([...previous, ...current])].filter((id) => live.has(id));
}
