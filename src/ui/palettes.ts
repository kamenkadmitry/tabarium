import { PALETTE_IDS, type Settings } from '../core/settings';

export type PaletteId = Settings['palette'];

/** Display names, keyed by the schema's palette ids — a missing entry here fails typecheck. */
const PALETTE_NAMES: Record<PaletteId, string> = {
  teal: 'Teal (default)',
  ocean: 'Ocean',
  forest: 'Forest',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
  slate: 'Slate',
  mocha: 'Mocha',
  graphite: 'Graphite',
  sunset: 'Sunset',
};

/**
 * The curated palettes offered in Settings → Appearance. Colours are intentionally not duplicated here:
 * a swatch carries `data-palette` + `data-theme` itself, so its preview is rendered by the real tokens.
 */
export const PALETTES: readonly { id: PaletteId; name: string }[] = PALETTE_IDS.map((id) => ({ id, name: PALETTE_NAMES[id] }));
