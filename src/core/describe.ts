import type { TabariumDB } from './db';
import { fetchPageInfo, type FetchLike } from './pageInfo';
import type { Repository } from './repo';

export interface DescribeResult {
  read: number;
  failed: { cardId: string; url: string; error: string }[];
}

/**
 * Reads the description and heading of each link's page, a few at a time. A page that cannot be read is recorded as
 * tried (so it is not asked again by itself) and reported in the result; nothing is retried here.
 */
export async function describeCards(
  db: TabariumDB,
  repo: Repository,
  cardIds: readonly string[],
  options: { fetchImpl?: FetchLike; concurrency?: number } = {},
): Promise<DescribeResult> {
  const result: DescribeResult = { read: 0, failed: [] };
  const queue = [...cardIds];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const card = await db.cards.get(id);
      if (!card) continue;
      try {
        await repo.setPageInfo(card.id, await fetchPageInfo(card.url, options.fetchImpl));
        result.read += 1;
      } catch (e) {
        console.error(`Tabarium: reading ${card.url} failed`, e);
        result.failed.push({ cardId: card.id, url: card.url, error: e instanceof Error ? e.message : String(e) });
        await repo.setPageInfo(card.id, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 3, Math.max(queue.length, 1)) }, worker));
  return result;
}
