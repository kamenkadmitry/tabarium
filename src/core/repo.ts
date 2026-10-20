import type { TabariumDB } from './db';
import { POSITION_STEP, positionAfterLast } from './position';
import type { Card, Collection, Space } from './types';

export interface NewCard {
  title: string;
  url: string;
  favIconUrl?: string | null;
}

/** Normalises a URL for duplicate detection: drops the hash and a trailing slash. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

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
          customTitle: null,
          note: null,
          starred: false,
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

  /** Moves a card to another collection, appending it at the end. */
  async moveCard(cardId: string, targetCollectionId: string): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.collections, async () => {
      if (!(await this.db.collections.get(targetCollectionId))) {
        throw new Error(`Collection ${targetCollectionId} does not exist`);
      }
      const siblings = await this.db.cards.where('collectionId').equals(targetCollectionId).toArray();
      const updated = await this.db.cards.update(cardId, {
        collectionId: targetCollectionId,
        position: positionAfterLast(siblings.map((c) => c.position)),
        updatedAt: Date.now(),
      });
      if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
    });
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
