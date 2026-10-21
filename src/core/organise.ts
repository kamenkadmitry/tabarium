import type { TabariumDB } from './db';
import { normalizeHashtag } from './hashtag';
import type { LabelContext, LibraryContext } from './ai/tasks';
import type { NewCard, Repository } from './repo';
import { normalizeUrl } from './url';

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

/** Existing tags, hashtags and collections (outside the Inbox), for suggesting details of links. */
export async function loadLabelContext(db: TabariumDB): Promise<LabelContext> {
  const [tags, hashtags, spaces, collections] = await Promise.all([
    db.tags.orderBy('position').toArray(),
    db.hashtags.orderBy('name').toArray(),
    db.spaces.orderBy('position').toArray(),
    db.collections.orderBy('position').toArray(),
  ]);
  const own = new Map(spaces.filter((s) => s.kind !== 'inbox').map((s) => [s.id, s.name]));
  return {
    tags: tags.map((t) => t.title),
    hashtags: hashtags.map((h) => h.name),
    collections: collections.flatMap((c) => {
      const space = own.get(c.spaceId);
      return space === undefined || c.title.trim() === '' ? [] : [{ space, title: c.title }];
    }),
  };
}

export interface DetailsToApply {
  cardId: string;
  note: string;
  /** Titles of tags; one that does not exist yet is created. */
  tags: readonly string[];
  /** Hashtag names; created when missing. */
  hashtags: readonly string[];
  /** Where the link should go; used only when moving is asked for. */
  destination?: { space: string; collection: string } | null;
}

/**
 * Applies suggested details to links without taking anything away: labels are added to the ones a link already has
 * (missing tags and hashtags are created), and a note is written only when the link has none. With `move` a link also
 * goes to its suggested collection (created when needed); if it is already there, the duplicate is dropped.
 * Returns how many links changed.
 */
export async function applyCardDetails(
  db: TabariumDB,
  repo: Repository,
  items: readonly DetailsToApply[],
  options: { tagColors: readonly string[]; move: boolean },
): Promise<number> {
  if (options.tagColors.length === 0) throw new Error('Colours for new tags are required');
  let changed = 0;
  for (const item of items) {
    const card = await db.cards.get(item.cardId);
    if (!card) throw new Error(`Card ${item.cardId} does not exist`);

    const tagIds = [...card.tagIds];
    for (const title of item.tags) {
      const known = (await db.tags.toArray()).find((t) => t.title.toLowerCase() === title.toLowerCase());
      const id = known?.id ?? (await repo.createTag(title, options.tagColors[(await db.tags.count()) % options.tagColors.length] ?? options.tagColors[0] ?? '')).id;
      if (!tagIds.includes(id)) tagIds.push(id);
    }
    const hashtagIds = [...card.hashtagIds];
    for (const name of item.hashtags) {
      const id = (await repo.ensureHashtag(name)).id;
      if (!hashtagIds.includes(id)) hashtagIds.push(id);
    }
    const fillNote = (card.note ?? '').trim() === '' && item.note.trim() !== '';
    const labelsChanged = tagIds.length !== card.tagIds.length || hashtagIds.length !== card.hashtagIds.length;
    if (fillNote || labelsChanged) {
      await repo.saveCard(card.id, fillNote ? { note: item.note.trim() } : {}, { tagIds, hashtagIds });
      changed += 1;
    }

    if (options.move && item.destination) {
      const space = (await db.spaces.toArray()).find((s) => s.kind !== 'inbox' && s.name.toLowerCase() === item.destination?.space.toLowerCase());
      if (!space) throw new Error(`The space “${item.destination.space}” does not exist`);
      const inSpace = await db.collections.where('spaceId').equals(space.id).toArray();
      const wanted = item.destination.collection.toLowerCase();
      const target = inSpace.find((c) => c.title.toLowerCase() === wanted) ?? (await repo.createCollection(space.id, item.destination.collection));
      if (card.collectionId !== target.id) {
        const key = normalizeUrl(card.url);
        const duplicate = (await db.cards.where('collectionId').equals(target.id).toArray()).some((c) => normalizeUrl(c.url) === key);
        if (duplicate) await repo.deleteCard(card.id);
        else await repo.moveCard(card.id, target.id);
        changed += labelsChanged || fillNote ? 0 : 1;
      }
    }
  }
  return changed;
}
