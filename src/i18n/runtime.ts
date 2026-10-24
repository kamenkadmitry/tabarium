import type { LanguageChoice, Locale } from './locale';
import { resolveLocale } from './locale';
import { makeT, type T } from './messages';

/**
 * A process-wide translator for code that cannot use React context: thrown error messages,
 * generated collection/window names, the background worker's context-menu titles. UI modules
 * call `setRuntimeLanguage` once they know the choice; the provider then calls `setRuntimeLocale`
 * on every change so thrown errors and generated names follow the visible language.
 * Default is English — errors thrown before any UI mounts stay diagnosable.
 */
let current: T = makeT('en');

export function setRuntimeLocale(locale: Locale): void {
  current = makeT(locale);
}

export function setRuntimeLanguage(choice: LanguageChoice, browserLanguages?: readonly string[]): Locale {
  const locale = resolveLocale(choice, browserLanguages);
  setRuntimeLocale(locale);
  return locale;
}

/** The translator for the language currently shown to the user. */
export function tr(): T {
  return current;
}
