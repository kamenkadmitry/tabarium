import type { TabariumDB } from './db';
import { normalizeHashtag } from './hashtag';
import type { LabelContext, LibraryContext } from './ai/tasks';
import type { NewCard, Repository } from './repo';

/** What the model should know about a space before it proposes groups. */
export async function loadLibraryContext(db: TabariumDB, spaceId: string): Promise<LibraryContext> {
  const [collections, tags, hashtags] = await Promise.all([
    db.collections.where('spaceId').equals(spaceId).toArray(),
    db.tags.orderBy('position').toArray(),
    db.hashtags.orderBy('name').toArray(),
  ]);
  return {
    collections: collections.map((c) => c.title).filter((t) => t.trim() !== ''),
    tags: tags.map((t) => t.title),
    hashtags: hashtags.map((h) => h.name),
  };
}

export interface GroupToApply {
  title: string;
  cards: NewCard[];
  /** Titles of existing tags to put on the collection. */
  tags?: readonly string[];
  /** Hashtag names (created when missing) to put on every card. */
  hashtags?: readonly string[];
}

/**
 * Saves proposed groups into a space: a collection with the same title is reused, otherwise it is created.
 * Existing tags are attached to the collection, hashtags to each card.
 */
export async function applyGroups(
  db: TabariumDB,
  repo: Repository,
  spaceId: string,
  groups: readonly GroupToApply[],
): Promise<{ collections: number; created: number; cards: number }> {
  let created = 0;
  let cards = 0;
  for (const g of groups) {
    const siblings = await db.collections.where('spaceId').equals(spaceId).toArray();
    let collection = siblings.find((c) => c.title.trim().toLowerCase() === g.title.trim().toLowerCase());
    if (!collection) {
      collection = await repo.createCollection(spaceId, g.title);
      created += 1;
    }
    const hashtagIds: string[] = [];
    for (const name of g.hashtags ?? []) {
      if (normalizeHashtag(name) !== '') hashtagIds.push((await repo.ensureHashtag(name)).id);
    }
    cards += (await repo.addCards(collection.id, g.cards.map((c) => ({ ...c, hashtagIds })))).length;

    const wanted = new Set((g.tags ?? []).map((t) => t.toLowerCase()));
    if (wanted.size > 0) {
      const tagIds = (await db.tags.toArray()).filter((t) => wanted.has(t.title.toLowerCase())).map((t) => t.id);
      await repo.setCollectionTags(collection.id, [...new Set([...collection.tagIds, ...tagIds])]);
    }
  }
  return { collections: groups.length, created, cards };
}

/** Existing tags and hashtags, for suggesting details of single links. */
export async function loadLabelContext(db: TabariumDB): Promise<LabelContext> {
  const [tags, hashtags] = await Promise.all([db.tags.orderBy('position').toArray(), db.hashtags.orderBy('name').toArray()]);
  return { tags: tags.map((t) => t.title), hashtags: hashtags.map((h) => h.name) };
}

export interface DetailsToApply {
  cardId: string;
  note: string;
  /** Titles of existing tags. */
  tags: readonly string[];
  /** Hashtag names; created when missing. */
  hashtags: readonly string[];
}

/**
 * Applies suggested details to links without taking anything away: labels are added to the ones a link already has,
 * and a note is written only when the link has none. Returns how many links changed.
 */
export async function applyCardDetails(db: TabariumDB, repo: Repository, items: readonly DetailsToApply[]): Promise<number> {
  const allTags = await db.tags.toArray();
  let changed = 0;
  for (const item of items) {
    const card = await db.cards.get(item.cardId);
    if (!card) throw new Error(`Card ${item.cardId} does not exist`);
    const wanted = new Set(item.tags.map((t) => t.toLowerCase()));
    const tagIds = [...new Set([...card.tagIds, ...allTags.filter((t) => wanted.has(t.title.toLowerCase())).map((t) => t.id)])];
    const hashtagIds = [...card.hashtagIds];
    for (const name of item.hashtags) {
      const id = (await repo.ensureHashtag(name)).id;
      if (!hashtagIds.includes(id)) hashtagIds.push(id);
    }
    const fillNote = (card.note ?? '').trim() === '' && item.note.trim() !== '';
    if (!fillNote && tagIds.length === card.tagIds.length && hashtagIds.length === card.hashtagIds.length) continue;
    await repo.saveCard(card.id, fillNote ? { note: item.note.trim() } : {}, { tagIds, hashtagIds });
    changed += 1;
  }
  return changed;
}
