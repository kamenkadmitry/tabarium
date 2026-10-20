/** Distance between neighbours when items are appended or the list is re-spaced. */
export const POSITION_STEP = 100;

/**
 * Position for an item inserted between two neighbours.
 * `before` / `after` are the positions of the neighbours; null means "no neighbour on that side".
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return (after as number) - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  if (before >= after) {
    throw new RangeError(`positionBetween: before (${before}) must be less than after (${after})`);
  }
  return (before + after) / 2;
}

/** Position for an item appended after the last one. */
export function positionAfterLast(positions: readonly number[]): number {
  return positions.length === 0 ? POSITION_STEP : Math.max(...positions) + POSITION_STEP;
}
