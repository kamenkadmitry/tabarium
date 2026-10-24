import type { MessageKey } from '../i18n/messages';

/** Catalogue key of a swatch's translated name. */
export type SwatchKey = Extract<MessageKey, `swatch.${string}`>;

/**
 * Swatches offered for collection colours and tags. Each has enough contrast on both surfaces.
 * `key` is the translated name for aria labels; `name` is kept for code that still reads it.
 */
export const SWATCHES = [
  { key: 'swatch.teal', name: 'Teal', value: '#0d9488' },
  { key: 'swatch.orange', name: 'Orange', value: '#ea580c' },
  { key: 'swatch.indigo', name: 'Indigo', value: '#6366f1' },
  { key: 'swatch.purple', name: 'Purple', value: '#a855f7' },
  { key: 'swatch.blue', name: 'Blue', value: '#0284c7' },
  { key: 'swatch.pink', name: 'Pink', value: '#db2777' },
  { key: 'swatch.green', name: 'Green', value: '#65a30d' },
  { key: 'swatch.red', name: 'Red', value: '#dc2626' },
] as const satisfies readonly { key: SwatchKey; name: string; value: string }[];
