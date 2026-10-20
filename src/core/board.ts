import type { Collection } from './types';

export type { BoardSort, BoardView } from './boardTypes';
import type { BoardSort } from './boardTypes';

export interface BoardFilter {
  /** A colour value, "none" for collections without a colour, or null for no colour filter. */
  color: string | 'none' | null;
  tagId: string | null;
}

export const NO_FILTER: BoardFilter = { color: null, tagId: null };

export const isFiltering = (f: BoardFilter): boolean => f.color !== null || f.tagId !== null;

export function filterCollections(collections: readonly Collection[], filter: BoardFilter): Collection[] {
  return collections.filter((c) => {
    if (filter.color !== null && (filter.color === 'none' ? c.color !== null : c.color !== filter.color)) return false;
    if (filter.tagId !== null && !c.tagIds.includes(filter.tagId)) return false;
    return true;
  });
}

/** Sorts a copy. "custom" keeps the manual order (the stored position); ties fall back to it as well. */
export function sortCollections(
  collections: readonly Collection[],
  sort: BoardSort,
  tabCounts: ReadonlyMap<string, number>,
): Collection[] {
  const byPosition = (a: Collection, b: Collection) => a.position - b.position;
  const count = (c: Collection) => tabCounts.get(c.id) ?? 0;
  const compare: Record<BoardSort, (a: Collection, b: Collection) => number> = {
    custom: byPosition,
    'name-asc': (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    'name-desc': (a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base', numeric: true }),
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    'most-tabs': (a, b) => count(b) - count(a),
  };
  return [...collections].sort((a, b) => compare[sort](a, b) || byPosition(a, b));
}
