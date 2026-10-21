import { useCallback, useRef, useState } from 'react';

/** Which links are ticked on the board. */
export interface CardSelection {
  selected: ReadonlySet<string>;
  /** Ticks or unticks one link; with Shift the whole range from the last clicked link (in `ordered`) is ticked. */
  toggle: (id: string, shift: boolean, ordered: readonly string[]) => void;
  /** Ticks or unticks several links at once, e.g. a whole collection. */
  setMany: (ids: readonly string[], on: boolean) => void;
  clear: () => void;
}

export function useCardSelection(): CardSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  const toggle = useCallback((id: string, shift: boolean, ordered: readonly string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const from = anchor.current === null ? -1 : ordered.indexOf(anchor.current);
      const to = ordered.indexOf(id);
      if (shift && from !== -1 && to !== -1) {
        for (const x of ordered.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(x);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    anchor.current = id;
  }, []);

  const setMany = useCallback((ids: readonly string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);

  return { selected, toggle, setMany, clear };
}
