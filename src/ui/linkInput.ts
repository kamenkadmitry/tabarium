import type { Card } from '../core/types';

export interface LinkValues {
  title: string;
  url: string;
  note: string;
  tagIds: string[];
  hashtagIds: string[];
}

/** Normalises user input like "example.com" into a full https URL; returns null if it is not a valid web URL. */
export function parseUserUrl(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The card fields that change when the editor is saved. A title equal to the page title is stored as "no custom title". */
export function cardPatch(card: Card, v: LinkValues) {
  const title = v.title.trim();
  return { customTitle: title === '' || title === card.title ? null : title, url: v.url, note: v.note.trim() === '' ? null : v.note };
}
