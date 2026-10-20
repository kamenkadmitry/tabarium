import type { DragEvent } from 'react';

export type DragPayload =
  | { type: 'card'; id: string }
  | { type: 'collection'; id: string }
  | { type: 'next'; id: string }
  /** Browser tabs dragged out of the Open tabs panel (ids are browser tab ids). */
  | { type: 'tabs'; tabIds: number[] };

/** dataTransfer contents are unreadable during dragover, so the payload is kept here for the drag's duration. */
let current: DragPayload | null = null;

/** True while browser tabs from the Open tabs panel are being dragged. */
export const isDraggingTabs = (): boolean => current?.type === 'tabs';

export const getDragPayload = (): DragPayload | null => current;

export function dragSourceProps(payload: DragPayload) {
  return {
    draggable: true as const,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      current = payload;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', payload.type === 'tabs' ? payload.tabIds.join(',') : payload.id);
    },
    onDragEnd: () => {
      current = null;
    },
  };
}

/** True when the pointer is in the upper half of the element, i.e. the drop lands before it. */
export function isUpperHalf(e: DragEvent<HTMLElement>): boolean {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2;
}

export function endDrag(): DragPayload | null {
  const payload = current;
  current = null;
  return payload;
}
