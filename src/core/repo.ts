import type { TabariumDB } from './db';
import { dedupeLinks, type ImportedSpace } from './formats';
import { planInsert } from './ordering';
import { POSITION_STEP, positionAfterLast } from './position';
import { normalizeHashtag } from './hashtag';
import type { Card, Collection, Hashtag, NextItem, Space, Tag } from './types';
import { normalizeUrl } from './url';

export interface NewCard {
  title: string;
  url: string;
  favIconUrl?: string | null;
  customTitle?: string | null;
  note?: string | null;
  tagIds?: readonly string[];
  hashtagIds?: readonly string[];
}

export { normalizeUrl };

export class Repository {
  constructor(private readonly db: TabariumDB) {}

  async createSpace(name: string): Promise<Space> {
    const existing = await this.db.spaces.toArray();
    const space: Space = {
      id: crypto.randomUUID(),
      name,
      position: positionAfterLast(existing.map((s) => s.position)),
      createdAt: Date.now(),
    };
    await this.db.spaces.add(space);
    return space;
  }

  async createCollection(spaceId: string, title: string): Promise<Collection> {
    if (!(await this.db.spaces.get(spaceId))) throw new Error(`Space ${spaceId} does not exist`);
    const siblings = await this.db.collections.where('spaceId').equals(spaceId).toArray();
    const now = Date.now();
    const collection: Collection = {
      id: crypto.randomUUID(),
      spaceId,
      title,
      color: null,
      expanded: true,
      tagIds: [],
      position: positionAfterLast(siblings.map((c) => c.position)),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.collections.add(collection);
    return collection;
  }

  /** Adds cards to a collection; URLs already present in it are skipped. Returns the cards actually added. */
  async addCards(collectionId: string, items: readonly NewCard[]): Promise<Card[]> {
    return this.db.transaction('rw', this.db.collections, this.db.cards, async () => {
      if (!(await this.db.collections.get(collectionId))) {
        throw new Error(`Collection ${collectionId} does not exist`);
      }
      const existing = await this.db.cards.where('collectionId').equals(collectionId).toArray();
      const seen = new Set(existing.map((c) => normalizeUrl(c.url)));
      let position = positionAfterLast(existing.map((c) => c.position));
      const now = Date.now();
      const added: Card[] = [];
      for (const item of items) {
        const key = normalizeUrl(item.url);
        if (seen.has(key)) continue;
        seen.add(key);
        added.push({
          id: crypto.randomUUID(),
          collectionId,
          title: item.title,
          url: item.url,
          favIconUrl: item.favIconUrl ?? null,
          customTitle: item.customTitle ?? null,
          note: item.note ?? null,
          starred: false,
          tagIds: [...(item.tagIds ?? [])],
          hashtagIds: [...(item.hashtagIds ?? [])],
          position,
          createdAt: now,
          updatedAt: now,
        });
        position += POSITION_STEP;
      }
      await this.db.cards.bulkAdd(added);
      return added;
    });
  }

  async renameSpace(spaceId: string, name: string): Promise<void> {
    if ((await this.db.spaces.update(spaceId, { name })) === 0) throw new Error(`Space ${spaceId} does not exist`);
  }

  async deleteSpace(spaceId: string): Promise<void> {
    const ids = await this.db.collections.where('spaceId').equals(spaceId).primaryKeys();
    for (const id of ids) await this.deleteCollection(id);
    await this.db.spaces.delete(spaceId);
  }

  async updateCollection(
    collectionId: string,
    patch: Partial<Pick<Collection, 'title' | 'color' | 'expanded' | 'tagIds'>>,
  ): Promise<void> {
    const updated = await this.db.collections.update(collectionId, { ...patch, updatedAt: Date.now() });
    if (updated === 0) throw new Error(`Collection ${collectionId} does not exist`);
  }

  async updateCard(
    cardId: string,
    patch: Partial<Pick<Card, 'title' | 'customTitle' | 'note' | 'starred' | 'url'>>,
  ): Promise<void> {
    if (patch.url !== undefined) new URL(patch.url);
    const updated = await this.db.cards.update(cardId, { ...patch, updatedAt: Date.now() });
    if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.nexts, async () => {
      await this.db.nexts.where('cardId').equals(cardId).delete();
      await this.db.cards.delete(cardId);
    });
  }

  /** Moves a card into a collection, directly before `beforeCardId` or at the end when it is null. */
  async moveCard(cardId: string, targetCollectionId: string, beforeCardId: string | null = null): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.collections, async () => {
      if (!(await this.db.collections.get(targetCollectionId))) {
        throw new Error(`Collection ${targetCollectionId} does not exist`);
      }
      const siblings = (await this.db.cards.where('collectionId').equals(targetCollectionId).toArray()).filter(
        (c) => c.id !== cardId,
      );
      const plan = planInsert(siblings, beforeCardId);
      if (plan.respace) {
        for (const s of plan.respace) await this.db.cards.update(s.id, { position: s.position });
      }
      const updated = await this.db.cards.update(cardId, {
        collectionId: targetCollectionId,
        position: plan.position,
        updatedAt: Date.now(),
      });
      if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
    });
  }

  /** Moves a collection into a space, directly before `beforeCollectionId` or at the end when it is null. */
  async moveCollection(collectionId: string, targetSpaceId: string, beforeCollectionId: string | null = null): Promise<void> {
    await this.db.transaction('rw', this.db.collections, this.db.spaces, async () => {
      if (!(await this.db.spaces.get(targetSpaceId))) throw new Error(`Space ${targetSpaceId} does not exist`);
      const siblings = (await this.db.collections.where('spaceId').equals(targetSpaceId).toArray()).filter(
        (c) => c.id !== collectionId,
      );
      const plan = planInsert(siblings, beforeCollectionId);
      if (plan.respace) {
        for (const s of plan.respace) await this.db.collections.update(s.id, { position: s.position });
      }
      const updated = await this.db.collections.update(collectionId, {
        spaceId: targetSpaceId,
        position: plan.position,
        updatedAt: Date.now(),
      });
      if (updated === 0) throw new Error(`Collection ${collectionId} does not exist`);
    });
  }

  async createTag(title: string, color: string): Promise<Tag> {
    const existing = await this.db.tags.toArray();
    const tag: Tag = { id: crypto.randomUUID(), title, color, position: positionAfterLast(existing.map((t) => t.position)) };
    await this.db.tags.add(tag);
    return tag;
  }

  async updateTag(tagId: string, patch: Partial<Pick<Tag, 'title' | 'color'>>): Promise<void> {
    if ((await this.db.tags.update(tagId, patch)) === 0) throw new Error(`Tag ${tagId} does not exist`);
  }

  async deleteTag(tagId: string): Promise<void> {
    await this.db.transaction('rw', this.db.tags, this.db.collections, this.db.cards, async () => {
      const affected = await this.db.collections.where('tagIds').equals(tagId).toArray();
      for (const c of affected) await this.db.collections.update(c.id, { tagIds: c.tagIds.filter((t) => t !== tagId) });
      const cards = await this.db.cards.where('tagIds').equals(tagId).toArray();
      for (const c of cards) await this.db.cards.update(c.id, { tagIds: c.tagIds.filter((t) => t !== tagId) });
      await this.db.tags.delete(tagId);
    });
  }

  /** Finds the hashtag with this name or creates it. Throws when the name has no usable characters. */
  async ensureHashtag(input: string): Promise<Hashtag> {
    const name = normalizeHashtag(input);
    if (name === '') throw new Error(`"${input}" is not a valid hashtag`);
    return this.db.transaction('rw', this.db.hashtags, async () => {
      const existing = await this.db.hashtags.where('name').equals(name).first();
      if (existing) return existing;
      const hashtag: Hashtag = { id: crypto.randomUUID(), name, createdAt: Date.now() };
      await this.db.hashtags.add(hashtag);
      return hashtag;
    });
  }

  async renameHashtag(hashtagId: string, input: string): Promise<void> {
    const name = normalizeHashtag(input);
    if (name === '') throw new Error(`"${input}" is not a valid hashtag`);
    const clash = await this.db.hashtags.where('name').equals(name).first();
    if (clash && clash.id !== hashtagId) throw new Error(`#${name} already exists`);
    if ((await this.db.hashtags.update(hashtagId, { name })) === 0) throw new Error(`Hashtag ${hashtagId} does not exist`);
  }

  async deleteHashtag(hashtagId: string): Promise<void> {
    await this.db.transaction('rw', this.db.hashtags, this.db.cards, async () => {
      const cards = await this.db.cards.where('hashtagIds').equals(hashtagId).toArray();
      for (const c of cards) await this.db.cards.update(c.id, { hashtagIds: c.hashtagIds.filter((h) => h !== hashtagId) });
      await this.db.hashtags.delete(hashtagId);
    });
  }

  /** Replaces the tags and hashtags of a card. Every id must exist. */
  async setCardLabels(cardId: string, labels: { tagIds: readonly string[]; hashtagIds: readonly string[] }): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.tags, this.db.hashtags, async () => {
      const tags = new Set(await this.db.tags.toCollection().primaryKeys());
      const hashtags = new Set(await this.db.hashtags.toCollection().primaryKeys());
      for (const t of labels.tagIds) if (!tags.has(t)) throw new Error(`Tag ${t} does not exist`);
      for (const h of labels.hashtagIds) if (!hashtags.has(h)) throw new Error(`Hashtag ${h} does not exist`);
      const updated = await this.db.cards.update(cardId, {
        tagIds: [...new Set(labels.tagIds)],
        hashtagIds: [...new Set(labels.hashtagIds)],
        updatedAt: Date.now(),
      });
      if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
    });
  }

  async setCollectionTags(collectionId: string, tagIds: readonly string[]): Promise<void> {
    const known = new Set(await this.db.tags.toCollection().primaryKeys());
    for (const t of tagIds) if (!known.has(t)) throw new Error(`Tag ${t} does not exist`);
    await this.updateCollection(collectionId, { tagIds: [...new Set(tagIds)] });
  }

  /** Adds a card to the Next queue (no-op if it is already queued). */
  async addToNext(cardId: string): Promise<NextItem> {
    return this.db.transaction('rw', this.db.cards, this.db.nexts, async () => {
      if (!(await this.db.cards.get(cardId))) throw new Error(`Card ${cardId} does not exist`);
      const existing = await this.db.nexts.toArray();
      const queued = existing.find((n) => n.cardId === cardId);
      if (queued) return queued;
      const item: NextItem = {
        id: crypto.randomUUID(),
        cardId,
        state: 'todo',
        position: positionAfterLast(existing.map((n) => n.position)),
      };
      await this.db.nexts.add(item);
      return item;
    });
  }

  async setNextState(nextId: string, state: NextItem['state']): Promise<void> {
    if ((await this.db.nexts.update(nextId, { state })) === 0) throw new Error(`Next item ${nextId} does not exist`);
  }

  async removeFromNext(nextId: string): Promise<void> {
    await this.db.nexts.delete(nextId);
  }

  async moveNext(nextId: string, beforeNextId: string | null): Promise<void> {
    await this.db.transaction('rw', this.db.nexts, async () => {
      const siblings = (await this.db.nexts.toArray()).filter((n) => n.id !== nextId);
      const plan = planInsert(siblings, beforeNextId);
      if (plan.respace) for (const s of plan.respace) await this.db.nexts.update(s.id, { position: s.position });
      if ((await this.db.nexts.update(nextId, { position: plan.position })) === 0) {
        throw new Error(`Next item ${nextId} does not exist`);
      }
    });
  }

  /** Adds imported spaces/collections/links. Existing data is untouched; spaces with the same name are reused. */
  async importStructure(spaces: readonly ImportedSpace[]): Promise<{ collections: number; cards: number }> {
    let collections = 0;
    let cards = 0;
    const tagByTitle = new Map((await this.db.tags.toArray()).map((t) => [t.title.toLowerCase(), t.id]));
    for (const s of spaces) {
      const existing = (await this.db.spaces.toArray()).find((x) => x.name === s.name);
      const space = existing ?? (await this.createSpace(s.name));
      for (const c of s.collections) {
        const col = await this.createCollection(space.id, c.title || 'Untitled');
        collections += 1;
        cards += (await this.addCards(col.id, dedupeLinks(c.links))).length;
        const tagIds: string[] = [];
        for (const tag of c.tags ?? []) {
          const key = tag.title.toLowerCase();
          let id = tagByTitle.get(key);
          if (id === undefined) {
            id = (await this.createTag(tag.title || 'Untitled', tag.color || '#0d9488')).id;
            tagByTitle.set(key, id);
          }
          tagIds.push(id);
        }
        if (tagIds.length > 0) await this.setCollectionTags(col.id, tagIds);
      }
    }
    return { collections, cards };
  }

  /** Groups of cards (across the whole library) that share a normalised URL. */
  async findDuplicates(): Promise<Card[][]> {
    const groups = new Map<string, Card[]>();
    for (const card of await this.db.cards.toArray()) {
      const key = normalizeUrl(card.url);
      const list = groups.get(key) ?? [];
      list.push(card);
      groups.set(key, list);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  /**
   * Adds cards and places them directly before `beforeCardId` (at the end when null), keeping their order.
   * Used when tabs are dropped between two cards.
   */
  async addCardsBefore(collectionId: string, items: readonly NewCard[], beforeCardId: string | null): Promise<Card[]> {
    if (beforeCardId !== null) {
      const anchor = await this.db.cards.get(beforeCardId);
      if (!anchor || anchor.collectionId !== collectionId) {
        throw new Error(`Card ${beforeCardId} is not in collection ${collectionId}`);
      }
    }
    const added = await this.addCards(collectionId, items);
    if (beforeCardId !== null) {
      for (const card of added) await this.moveCard(card.id, collectionId, beforeCardId);
    }
    return added;
  }

  /** Expands or collapses every collection of a space (the "+" and "-" buttons above the board). */
  async setExpandedAll(spaceId: string, expanded: boolean): Promise<void> {
    await this.db.collections.where('spaceId').equals(spaceId).modify({ expanded, updatedAt: Date.now() });
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.db.transaction('rw', this.db.collections, this.db.cards, this.db.nexts, async () => {
      const cardIds = await this.db.cards.where('collectionId').equals(collectionId).primaryKeys();
      await this.db.nexts.where('cardId').anyOf(cardIds).delete();
      await this.db.cards.bulkDelete(cardIds);
      await this.db.collections.delete(collectionId);
    });
  }
}
