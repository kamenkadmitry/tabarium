import { format, pluralize, type Locale, type PluralEntry } from './locale';
import { en } from './messages/en';
import { ru } from './messages/ru';
import { pl } from './messages/pl';
import { be } from './messages/be';

/** English is the key schema; every other catalogue must provide the same keys with the same shape. */
export type Messages = typeof en;
export type MessageKey = keyof Messages;
export type PluralKey = { [K in MessageKey]: Messages[K] extends PluralEntry ? K : never }[MessageKey];
export type StringKey = Exclude<MessageKey, PluralKey>;

export const DICTS: Record<Locale, Messages> = { en, ru, pl, be };

export interface T {
  /** A catalogue message with {placeholders} interpolated. */
  (key: StringKey, params?: Record<string, string | number>): string;
  /** A plural message: the variant comes from Intl.PluralRules for the active language. */
  plural(key: PluralKey, n: number, params?: Record<string, string | number>): string;
  /** The resolved locale driving every format below. */
  locale: Locale;
  /** Date in the active language, e.g. collection names and backup stamps. */
  date(d: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /** Date and time in the active language. */
  time(d: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /** Number with grouping in the active language. */
  num(n: number): string;
  /** Locale-aware "a, b and c" list for status sentences. */
  list(parts: readonly string[]): string;
}

const cache = new Map<Locale, T>();

/** Builds the translator for one locale. `t` reads plain keys, `t.plural` reads plural keys. */
export function makeT(locale: Locale): T {
  const hit = cache.get(locale);
  if (hit) return hit;
  const dict = DICTS[locale];
  const t = ((key: StringKey, params?: Record<string, string | number>) => format(dict[key] as string, params)) as T;
  t.plural = (key: PluralKey, n: number, params?: Record<string, string | number>) => pluralize(locale, dict[key] as PluralEntry, n, params);
  t.locale = locale;
  t.date = (d, options) => new Date(d).toLocaleDateString(locale, options);
  t.time = (d, options) => new Date(d).toLocaleString(locale, options);
  t.num = (n) => n.toLocaleString(locale);
  const listFormat = new Intl.ListFormat(locale, { type: 'conjunction' });
  t.list = (parts) => listFormat.format(parts);
  cache.set(locale, t);
  return t;
}
