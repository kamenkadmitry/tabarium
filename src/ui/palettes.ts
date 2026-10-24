import { PALETTE_IDS, type Settings } from '../core/settings';
import type { MessageKey } from '../i18n/messages';

export type PaletteId = Settings['palette'];

/** Catalogue key of a palette's translated name. */
export type PaletteKey = Extract<MessageKey, `palette.${string}`>;

/** Catalogue keys of the display names, keyed by the schema's palette ids — a missing entry here fails typecheck. */
const PALETTE_KEYS: Record<PaletteId, PaletteKey> = {
  teal: 'palette.teal',
  ocean: 'palette.ocean',
  forest: 'palette.forest',
  violet: 'palette.violet',
  rose: 'palette.rose',
  amber: 'palette.amber',
  slate: 'palette.slate',
  mocha: 'palette.mocha',
  graphite: 'palette.graphite',
  sunset: 'palette.sunset',
};

/**
 * The curated palettes offered in Settings → Appearance. Colours are intentionally not duplicated here:
 * a swatch carries `data-palette` + `data-theme` itself, so its preview is rendered by the real tokens.
 */
export const PALETTES: readonly { id: PaletteId; key: PaletteKey }[] = PALETTE_IDS.map((id) => ({ id, key: PALETTE_KEYS[id] }));
