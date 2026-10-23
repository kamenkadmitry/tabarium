import type { Card, Hashtag, Tag } from '../core/types';

/** The searchable label text of a card: its tag titles and `#`-prefixed hashtag names. */
export function cardLabelText(card: Card, tags: readonly Tag[], hashtags: readonly Hashtag[]): string {
  return [
    ...card.tagIds.flatMap((id) => tags.find((t) => t.id === id)?.title ?? []),
    ...card.hashtagIds.flatMap((id) => hashtags.find((h) => h.id === id)?.name ?? []).map((n) => `#${n}`),
  ].join(' ');
}

/** Everything the library search matches on, lowercased: title, custom title, URL, note and labels. */
export function cardSearchText(card: Card, tags: readonly Tag[], hashtags: readonly Hashtag[]): string {
  return `${card.title} ${card.customTitle ?? ''} ${card.url} ${card.note ?? ''} ${cardLabelText(card, tags, hashtags)}`.toLowerCase();
}
