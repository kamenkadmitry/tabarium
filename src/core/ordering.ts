import { POSITION_STEP, positionBetween } from './position';

export interface Positioned {
  id: string;
  position: number;
}

/** Below this gap between neighbours the list is re-spaced instead of splitting the gap again. */
const MIN_GAP = 1e-3;

export interface InsertPlan {
  /** Position for the moved item. */
  position: number;
  /** When set, these items must be rewritten with the given positions first (gap exhausted). */
  respace: Positioned[] | null;
}

/**
 * Plans where to put an item so that it ends up directly before `beforeId`
 * (or at the end when `beforeId` is null). `siblings` must not contain the moved item.
 */
export function planInsert(siblings: readonly Positioned[], beforeId: string | null): InsertPlan {
  const sorted = [...siblings].sort((a, b) => a.position - b.position);
  const index = beforeId === null ? sorted.length : sorted.findIndex((s) => s.id === beforeId);
  if (index === -1) throw new Error(`planInsert: item ${beforeId} is not among the siblings`);
  const prev = sorted[index - 1]?.position ?? null;
  const next = sorted[index]?.position ?? null;
  if (prev !== null && next !== null && next - prev < MIN_GAP) {
    const respaced = sorted.map((s, i) => ({ id: s.id, position: (i + 1) * POSITION_STEP }));
    const newPrev = respaced[index - 1]?.position ?? null;
    const newNext = respaced[index]?.position ?? null;
    return { position: positionBetween(newPrev, newNext), respace: respaced };
  }
  return { position: positionBetween(prev, next), respace: null };
}
