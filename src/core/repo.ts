import type { TabariumDB } from './db';
import { dedupeLinks, type ImportedSpace } from './formats';
import { planInsert } from './ordering';
import { POSITION_STEP, positionAfterLast } from './position';
import { bumpActivity } from './activity';
import { normalizeHashtag } from './hashtag';
import type { PageInfo } from './pageInfo';
import type { ActivityType, Card, Collection, Hashtag, Space, Tag } from './types';
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

/** Why a link is deleted, when that matters for the dashboard. */
export type DeleteReason = 'duplicate';

export class Repository {
  constructor(private readonly db: TabariumDB) {}

  async createSpace(name: string, icon: string | null = null, kind: Space['kind'] = 'user'): Promise<Space> {
    const existing = await this.db.spaces.toArray();
    const space: Space = {
      id: crypto.randomUUID(),
      name,
      icon,
      kind,
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
    return this.db.transaction('rw', this.db.collections, this.db.cards, this.db.activity, async () => {
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
          description: null,
          heading: null,
          pageInfoAt: null,
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
      await bumpActivity(this.db, 'added', added.length);
      return added;
    });
  }

  /** The Inbox is a system space: it is never renamed, edited or deleted. */
  private async assertUserSpace(spaceId: string, action: string): Promise<void> {
    if ((await this.db.spaces.get(spaceId))?.kind === 'inbox') throw new Error(`The Inbox is a system space and cannot be ${action}`);
  }

  /** Changes the name and the icon of a space together. */
  async updateSpace(spaceId: string, patch: { name: string; icon: string | null }): Promise<void> {
    await this.assertUserSpace(spaceId, 'changed');
    if (patch.name.trim() === '') throw new Error('A space needs a name');
    if ((await this.db.spaces.update(spaceId, { name: patch.name.trim(), icon: patch.icon })) === 0) throw new Error(`Space ${spaceId} does not exist`);
  }

  async renameSpace(spaceId: string, name: string): Promise<void> {
    await this.assertUserSpace(spaceId, 'renamed');
    if ((await this.db.spaces.update(spaceId, { name })) === 0) throw new Error(`Space ${spaceId} does not exist`);
  }

  async deleteSpace(spaceId: string): Promise<void> {
    await this.assertUserSpace(spaceId, 'deleted');
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
    // A new address is a different page: what was read from the old one no longer applies.
    const changedUrl = patch.url !== undefined && patch.url !== (await this.db.cards.get(cardId))?.url;
    const reset = changedUrl ? { description: null, heading: null, pageInfoAt: null } : {};
    const updated = await this.db.cards.update(cardId, { ...patch, ...reset, updatedAt: Date.now() });
    if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
  }

  /** Stores what was read from the page; null records that the page was tried and gave nothing. */
  async setPageInfo(cardId: string, info: PageInfo | null): Promise<void> {
    const updated = await this.db.cards.update(cardId, { description: info?.description ?? null, heading: info?.heading ?? null, pageInfoAt: Date.now() });
    if (updated === 0) throw new Error(`Card ${cardId} does not exist`);
  }

  /** Saves the fields and the labels of a card together: either both are stored or neither. */
  async saveCard(
    cardId: string,
    patch: Partial<Pick<Card, 'title' | 'customTitle' | 'note' | 'starred' | 'url'>>,
    labels: { tagIds: readonly string[]; hashtagIds: readonly string[] },
  ): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.tags, this.db.hashtags, async () => {
      await this.updateCard(cardId, patch);
      await this.setCardLabels(cardId, labels);
    });
  }

  /** Moves links to the end of a collection, keeping their order. Links already there stay where they are. */
  async moveCards(cardIds: readonly string[], targetCollectionId: string): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.collections, async () => {
      if (!(await this.db.collections.get(targetCollectionId))) throw new Error(`Collection ${targetCollectionId} does not exist`);
      const found = await this.db.cards.bulkGet([...cardIds]);
      const cards = found.flatMap((c) => c ?? []);
      if (cards.length !== cardIds.length) throw new Error('Some of the links no longer exist');
      const moving = cards.filter((c) => c.collectionId !== targetCollectionId).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
      for (const c of moving) await this.moveCard(c.id, targetCollectionId);
    });
  }

  /** Adds tags and hashtags to links; what they already have is kept. */
  async addLabelsToCards(cardIds: readonly string[], labels: { tagIds: readonly string[]; hashtagIds: readonly string[] }): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.tags, this.db.hashtags, async () => {
      const tags = new Set(await this.db.tags.toCollection().primaryKeys());
      const hashtags = new Set(await this.db.hashtags.toCollection().primaryKeys());
      for (const t of labels.tagIds) if (!tags.has(t)) throw new Error(`Tag ${t} does not exist`);
      for (const h of labels.hashtagIds) if (!hashtags.has(h)) throw new Error(`Hashtag ${h} does not exist`);
      const found = await this.db.cards.bulkGet([...cardIds]);
      if (found.some((c) => !c)) throw new Error('Some of the links no longer exist');
      for (const c of found) {
        if (!c) continue;
        await this.db.cards.update(c.id, {
          tagIds: [...new Set([...c.tagIds, ...labels.tagIds])],
          hashtagIds: [...new Set([...c.hashtagIds, ...labels.hashtagIds])],
          updatedAt: Date.now(),
        });
      }
    });
  }

  async setStarred(cardIds: readonly string[], starred: boolean): Promise<void> {
    await this.db.cards.where('id').anyOf([...cardIds]).modify({ starred, updatedAt: Date.now() });
  }

  /** Deletes links together with their Next entries. A deleted duplicate is counted as such on the dashboard. */
  async deleteCards(cardIds: readonly string[], reason?: DeleteReason): Promise<void> {
    await this.db.transaction('rw', this.db.cards, this.db.nexts, this.db.activity, async () => {
      const existing = (await this.db.cards.bulkGet([...cardIds])).filter((c) => c !== undefined).length;
      await this.db.nexts.where('cardId').anyOf([...cardIds]).delete();
      await this.db.cards.bulkDelete([...cardIds]);
      await bumpActivity(this.db, 'deleted', existing);
      if (reason === 'duplicate') await bumpActivity(this.db, 'duplicates-removed', existing);
    });
  }

  async deleteCard(cardId: string, reason?: DeleteReason): Promise<void> {
    await this.deleteCards([cardId], reason);
  }

  /** Records something that happened outside the data itself (a duplicate was skipped or created on purpose). */
  async recordActivity(type: ActivityType, count: number): Promise<void> {
    await this.db.transaction('rw', this.db.activity, () => bumpActivity(this.db, type, count));
  }

  /** Moves a card into a collection, directly before `beforeCardId` or at the end when it is null. */
  async moveCard(cardId: string, targetCollectionId: string, beforeCardId: string | null = null): Promise<void> {
    // Dropping a card on its own spot leaves everything as it is.
    if (beforeCardId === cardId) return;
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
    if (beforeCollectionId === collectionId) return;
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

  /** Moves every link from one hashtag to another (no duplicates) and deletes the first. */
  async mergeHashtag(fromId: string, intoId: string): Promise<void> {
    if (fromId === intoId) throw new Error('Choose a different hashtag to merge into');
    await this.db.transaction('rw', this.db.hashtags, this.db.cards, async () => {
      if (!(await this.db.hashtags.get(fromId))) throw new Error(`Hashtag ${fromId} does not exist`);
      if (!(await this.db.hashtags.get(intoId))) throw new Error(`Hashtag ${intoId} does not exist`);
      const cards = await this.db.cards.where('hashtagIds').equals(fromId).toArray();
      for (const c of cards) {
        await this.db.cards.update(c.id, { hashtagIds: [...new Set(c.hashtagIds.map((h) => (h === fromId ? intoId : h)))] });
      }
      await this.db.hashtags.delete(fromId);
    });
  }

  /** Deletes every hashtag no link uses. Returns how many were removed. */
  async deleteUnusedHashtags(): Promise<number> {
    return this.db.transaction('rw', this.db.hashtags, this.db.cards, async () => {
      let removed = 0;
      for (const h of await this.db.hashtags.toArray()) {
        if ((await this.db.cards.where('hashtagIds').equals(h.id).count()) === 0) {
          await this.db.hashtags.delete(h.id);
          removed += 1;
        }
      }
      return removed;
    });
  }

  /** Deletes every tag that no collection and no link uses. Returns how many were removed. */
  async deleteUnusedTags(): Promise<number> {
    return this.db.transaction('rw', this.db.tags, this.db.collections, this.db.cards, async () => {
      let removed = 0;
      for (const t of await this.db.tags.toArray()) {
        const used = (await this.db.collections.where('tagIds').equals(t.id).count()) + (await this.db.cards.where('tagIds').equals(t.id).count());
        if (used === 0) {
          await this.db.tags.delete(t.id);
          removed += 1;
        }
      }
      return removed;
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
    await this.db.transaction('rw', this.db.collections, this.db.cards, this.db.nexts, this.db.activity, async () => {
      const cardIds = await this.db.cards.where('collectionId').equals(collectionId).primaryKeys();
      await bumpActivity(this.db, 'deleted', cardIds.length);
      await this.db.nexts.where('cardId').anyOf(cardIds).delete();
      await this.db.cards.bulkDelete(cardIds);
      await this.db.collections.delete(collectionId);
    });
  }
}
