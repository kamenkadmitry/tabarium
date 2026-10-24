import { describe, expect, it } from 'vitest';
import { format, LANGUAGE_CHOICES, LOCALES, pluralize, resolveLocale, type Locale, type PluralEntry } from '../src/i18n/locale';
import { DICTS, makeT } from '../src/i18n/messages';
import { en } from '../src/i18n/messages/en';

describe('resolveLocale', () => {
  it('returns the explicit choice without consulting the browser', () => {
    expect(resolveLocale('be', ['en-US'])).toBe('be');
    expect(resolveLocale('pl')).toBe('pl');
  });

  it('reduces browser subtags to a supported language', () => {
    expect(resolveLocale('system', ['ru-RU'])).toBe('ru');
    expect(resolveLocale('system', ['be-BY'])).toBe('be');
    expect(resolveLocale('system', ['PL'])).toBe('pl');
  });

  it('takes the first supported language from the browser list', () => {
    expect(resolveLocale('system', ['fr-FR', 'pl-PL', 'en'])).toBe('pl');
  });

  it('falls back to English for unsupported or empty browser languages', () => {
    expect(resolveLocale('system', ['de-DE', 'fr'])).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
  });

  it('offers every shipped language plus system', () => {
    expect(LANGUAGE_CHOICES).toEqual(['system', ...LOCALES]);
    expect(LOCALES).toEqual(['en', 'ru', 'pl', 'be']);
  });
});

describe('format', () => {
  it('substitutes named parameters', () => {
    expect(format('{n} of {total}', { n: 2, total: 9 })).toBe('2 of 9');
  });

  it('leaves unknown placeholders visible', () => {
    expect(format('Hi {name}', {})).toBe('Hi {name}');
  });
});

describe('pluralize', () => {
  const entry: PluralEntry = { one: '{n} link', other: '{n} links' };

  it('picks the category of the locale and interpolates n', () => {
    expect(pluralize('en', entry, 1)).toBe('1 link');
    expect(pluralize('en', entry, 5)).toBe('5 links');
  });

  it('falls back to other when the entry lacks the needed form', () => {
    // Russian 2 needs "few"; the entry has none, so "other" is used.
    expect(pluralize('ru', entry, 2)).toBe('2 links');
  });
});

describe('catalogue parity', () => {
  const enKeys = Object.keys(en).sort();
  const shapeOf = (v: unknown) => (typeof v === 'string' ? 'string' : Object.keys(v as object).sort().join(','));

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has exactly the English keys', (locale) => {
    expect(Object.keys(DICTS[locale]).sort()).toEqual(enKeys);
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s plural entries have the same forms as English', (locale) => {
    const dict = DICTS[locale] as Record<string, unknown>;
    for (const key of enKeys) {
      expect(shapeOf(dict[key]), `key ${key}`).toBe(shapeOf((en as Record<string, unknown>)[key]));
    }
  });
});

describe('plural rules per locale', () => {
  const cases: [locale: Locale, n: number, expected: string][] = [
    ['en', 1, '1 link'],
    ['en', 2, '2 links'],
    ['ru', 1, '1 ссылка'],
    ['ru', 2, '2 ссылки'],
    ['ru', 5, '5 ссылок'],
    ['ru', 21, '21 ссылка'],
    ['ru', 22, '22 ссылки'],
    ['pl', 1, '1 link'],
    ['pl', 3, '3 linki'],
    ['pl', 5, '5 linków'],
    ['pl', 22, '22 linki'],
    ['be', 1, '1 спасылка'],
    ['be', 2, '2 спасылкі'],
    ['be', 5, '5 спасылак'],
    ['be', 21, '21 спасылка'],
    ['be', 25, '25 спасылак'],
  ];

  it.each(cases)('%s × %d → %s', (locale, n, expected) => {
    expect(makeT(locale).plural('count.links', n)).toBe(expected);
  });
});

describe('formatting helpers', () => {
  it('formats numbers in the locale', () => {
    expect(makeT('en').num(1234567)).toBe('1,234,567');
    // The exact group separator varies by ICU build; what matters is the locales differ.
    expect(makeT('ru').num(1234567)).not.toBe('1,234,567');
    expect(makeT('pl').num(1234567)).not.toBe('1,234,567');
  });

  it('joins lists the way the locale expects', () => {
    expect(makeT('en').list(['alpha', 'beta', 'gamma'])).toBe('alpha, beta, and gamma');
    expect(makeT('ru').list(['alpha', 'beta', 'gamma'])).toBe('alpha, beta и gamma');
  });

  it('formats dates in the locale', () => {
    const d = new Date(2024, 0, 15);
    expect(makeT('en').date(d)).toBe('1/15/2024');
    expect(makeT('ru').date(d)).toBe('15.01.2024');
    expect(makeT('pl').date(d)).toBe('15.01.2024');
  });
});
