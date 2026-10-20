import { z } from 'zod';
import type { TabariumDB } from './db';

export const AI_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'custom'] as const;

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  autoBackup: z.object({
    enabled: z.boolean(),
    intervalHours: z.number().int().min(1).max(24 * 30),
  }),
  lastBackupAt: z.number().int().nullable(),
  ai: z.object({
    provider: z.enum(AI_PROVIDERS).nullable(),
    model: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoBackup: { enabled: false, intervalHours: 24 },
  lastBackupAt: null,
  ai: { provider: null, model: '', baseUrl: '', apiKey: '' },
};

const KEY = 'settings';

/** Loads settings; a missing record means first run. A stored record that fails validation throws. */
export async function loadSettings(db: TabariumDB): Promise<Settings> {
  const row = await db.settings.get(KEY);
  if (!row) return DEFAULT_SETTINGS;
  return SettingsSchema.parse(row.value);
}

export async function saveSettings(db: TabariumDB, settings: Settings): Promise<void> {
  await db.settings.put({ key: KEY, value: SettingsSchema.parse(settings) });
}

export async function updateSettings(db: TabariumDB, patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await loadSettings(db)), ...patch };
    await saveSettings(db, next);
    return next;
  });
}
