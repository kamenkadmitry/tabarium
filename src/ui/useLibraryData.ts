import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../core/instance';
import { normalizeUrl } from '../core/url';
import type { Card, Collection, NextItem, Space, Tag } from '../core/types';

export interface LibraryData {
  spaces: Space[];
  collections: Collection[];
  cards: Card[];
  tags: Tag[];
  nexts: NextItem[];
  cardsByCollection: Map<string, Card[]>;
  cardById: Map<string, Card>;
  collectionById: Map<string, Collection>;
  duplicates: { url: string; cards: Card[] }[];
}

/** Live, derived view of the whole library. Returns null until the first read completes. */
export function useLibraryData(): LibraryData | null {
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const cards = useLiveQuery(() => db.cards.orderBy('position').toArray(), []);
  const tags = useLiveQuery(() => db.tags.orderBy('position').toArray(), []);
  const nexts = useLiveQuery(() => db.nexts.orderBy('position').toArray(), []);
  if (!spaces || !collections || !cards || !tags || !nexts) return null;

  const cardsByCollection = new Map<string, Card[]>();
  const byUrl = new Map<string, Card[]>();
  for (const c of cards) {
    const list = cardsByCollection.get(c.collectionId) ?? [];
    list.push(c);
    cardsByCollection.set(c.collectionId, list);
    const key = normalizeUrl(c.url);
    byUrl.set(key, [...(byUrl.get(key) ?? []), c]);
  }
  return {
    spaces,
    collections,
    cards,
    tags,
    nexts,
    cardsByCollection,
    cardById: new Map(cards.map((c) => [c.id, c])),
    collectionById: new Map(collections.map((c) => [c.id, c])),
    duplicates: [...byUrl.entries()].filter(([, g]) => g.length > 1).map(([url, g]) => ({ url, cards: g })),
  };
}
