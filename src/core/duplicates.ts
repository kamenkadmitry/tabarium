import type { TabariumDB } from './db';
import { normalizeUrl } from './url';

/** Where a link that is about to be added already lives in the library. */
export interface ExistingLink {
  title: string;
  space: string;
  collection: string;
  /** How many copies of the address the library holds. */
  copies: number;
}

/**
 * Looks the addresses up in the whole library (every space, the Inbox included). Addresses are compared the way the
 * Duplicates page compares them: without the hash and a trailing slash. The result is keyed by that normalised address.
 */
export async function findExistingLinks(db: TabariumDB, urls: readonly string[]): Promise<Map<string, ExistingLink>> {
  const wanted = new Set(urls.map(normalizeUrl));
  const found = new Map<string, ExistingLink>();
  if (wanted.size === 0) return found;
  const [cards, collections, spaces] = await Promise.all([db.cards.toArray(), db.collections.toArray(), db.spaces.toArray()]);
  const collectionById = new Map(collections.map((c) => [c.id, c]));
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  // The copy reported is the first one in reading order: space, then collection, then position inside it.
  const spaceOrder = new Map(spaces.map((s) => [s.id, s.position]));
  const order = (c: (typeof cards)[number]) => {
    const col = collectionById.get(c.collectionId);
    return [spaceOrder.get(col?.spaceId ?? '') ?? 0, col?.position ?? 0, c.position];
  };
  cards.sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0) || (x[2] ?? 0) - (y[2] ?? 0);
  });
  for (const card of cards) {
    const key = normalizeUrl(card.url);
    if (!wanted.has(key)) continue;
    const known = found.get(key);
    if (known) {
      known.copies += 1;
      continue;
    }
    const collection = collectionById.get(card.collectionId);
    found.set(key, {
      title: card.customTitle ?? card.title,
      space: (collection && spaceById.get(collection.spaceId)?.name) ?? '',
      collection: collection?.title ?? '',
      copies: 1,
    });
  }
  return found;
}
