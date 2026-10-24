import type { DragEvent } from 'react';
import { tr } from '../i18n/runtime';

export type DragPayload =
  | { type: 'card'; id: string }
  | { type: 'collection'; id: string }
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

/** MIME type of links dragged from another Tabarium page, e.g. from the side panel into the library. */
export const LINKS_MIME = 'application/x-tabarium-links';

export interface DraggedLink {
  title: string;
  url: string;
  favIconUrl: string | null;
}

/**
 * Makes an element a drag source for links that another page (the library next to the side panel) can drop.
 * The data travels in `dataTransfer`, because the two pages do not share memory. The addresses are also offered as
 * plain URLs so the browser itself understands the drop.
 */
export function linkDragProps(links: readonly DraggedLink[]) {
  return {
    draggable: true as const,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData(LINKS_MIME, JSON.stringify(links));
      e.dataTransfer.setData('text/uri-list', links.map((l) => l.url).join('\r\n'));
      e.dataTransfer.setData('text/plain', links.map((l) => l.url).join('\n'));
    },
  };
}

/** True while links from another Tabarium page are being dragged over this one (their contents are not readable yet). */
export const hasExternalLinks = (e: DragEvent): boolean => e.dataTransfer.types.includes(LINKS_MIME);

/** Reads dropped links. Throws when the data is not what `linkDragProps` writes, so a bad drop is reported. */
export function readExternalLinks(e: DragEvent): DraggedLink[] {
  const raw = e.dataTransfer.getData(LINKS_MIME);
  return parseDraggedLinks(raw);
}

export function parseDraggedLinks(raw: string): DraggedLink[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) throw new Error(tr()('err.noLinksDropped'));
  return data.map((item: unknown) => {
    const l = item as Partial<DraggedLink> | null;
    if (!l || typeof l.url !== 'string' || !/^https?:\/\//.test(l.url)) throw new Error(tr()('err.badLinkDropped'));
    return { title: typeof l.title === 'string' && l.title !== '' ? l.title : l.url, url: l.url, favIconUrl: typeof l.favIconUrl === 'string' ? l.favIconUrl : null };
  });
}
