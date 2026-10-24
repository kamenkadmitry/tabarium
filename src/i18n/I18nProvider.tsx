import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../core/instance';
import { loadSettings } from '../core/settings';
import { resolveLocale, type LanguageChoice, type Locale } from './locale';
import { makeT, type T } from './messages';
import { setRuntimeLocale } from './runtime';

const I18nContext = createContext<T | null>(null);

/**
 * Resolves the active language once for the whole tree and re-renders it when the setting
 * changes. `initial` is the value the entrypoint loaded before first paint, so a non-English
 * user never sees an English flash.
 */
export function I18nProvider({ initial, children }: { initial: LanguageChoice; children: React.ReactNode }) {
  const settings = useLiveQuery(() => loadSettings(db), []);
  const locale: Locale = useMemo(() => resolveLocale(settings?.language ?? initial), [settings?.language, initial]);
  useEffect(() => {
    document.documentElement.lang = locale;
    setRuntimeLocale(locale);
  }, [locale]);
  const t = useMemo(() => makeT(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT must be used inside I18nProvider');
  return t;
}
