import { repo } from '../core/instance';
import type { Card, Hashtag, Tag } from '../core/types';
import { SWATCHES } from './colors';
import type { LabelsApi } from './labels';

/** What the editor needs to pick, count and create tags and hashtags. */
export function buildLabelsApi(tags: readonly Tag[], hashtags: readonly Hashtag[], cards: readonly Card[]): LabelsApi {
  return {
    tags,
    hashtags,
    tagUsage: new Map(tags.map((t) => [t.id, cards.filter((c) => c.tagIds.includes(t.id)).length])),
    hashtagUsage: new Map(hashtags.map((h) => [h.id, cards.filter((c) => c.hashtagIds.includes(h.id)).length])),
    swatches: SWATCHES.map((sw) => sw.value),
    createTag: async (name, color) => (await repo.createTag(name, color ?? (SWATCHES[tags.length % SWATCHES.length] ?? SWATCHES[0]!).value)).id,
    createHashtag: async (name) => (await repo.ensureHashtag(name)).id,
  };
}
