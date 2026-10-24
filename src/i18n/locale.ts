/** Languages the interface ships in. 'system' is a settings value, not a locale. */
export const LOCALES = ['en', 'ru', 'pl', 'be'] as const;
export type Locale = (typeof LOCALES)[number];

/** Language names written in the language itself — they stay readable whatever the UI language is. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  pl: 'Polski',
  be: 'Беларуская',
};

/** Stored in settings; 'system' follows the browser UI language. */
export const LANGUAGE_CHOICES = ['system', ...LOCALES] as const;
export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

/**
 * Resolves the effective language: an explicit choice wins; 'system' takes the first browser
 * language we support (language subtag only — 'ru-RU' resolves to 'ru'), else English.
 */
export function resolveLocale(choice: LanguageChoice, browserLanguages?: readonly string[]): Locale {
  if (choice !== 'system') return choice;
  const langs = browserLanguages ?? (typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]));
  for (const raw of langs) {
    const lang = raw.toLowerCase().split('-')[0] ?? '';
    if ((LOCALES as readonly string[]).includes(lang)) return lang as Locale;
  }
  return 'en';
}

/**
 * A catalogue entry: a plain message, or per-plural-category variants keyed by what
 * Intl.PluralRules can select for that locale ('one' and 'other' are always required;
 * Russian, Polish and Belarusian also fill 'few' and 'many').
 */
export interface PluralEntry {
  one: string;
  other: string;
  few?: string;
  many?: string;
}
export type MessageEntry = string | PluralEntry;

/** Replaces {name} placeholders with params. An unknown placeholder is left visible on purpose. */
export function format(message: string, params: Record<string, string | number> = {}): string {
  return message.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** Picks the entry's variant for n via Intl.PluralRules and interpolates {n} plus any extra params. */
export function pluralize(locale: Locale, entry: PluralEntry, n: number, params: Record<string, string | number> = {}): string {
  const rules = pluralRules.get(locale) ?? new Intl.PluralRules(locale);
  pluralRules.set(locale, rules);
  const form = rules.select(n);
  const message = (entry as Partial<Record<Intl.LDMLPluralRule, string>>)[form] ?? entry.other;
  return format(message, { n, ...params });
}
