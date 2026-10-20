import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from '../src/core/settings';

let db: TabariumDB;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
});

describe('settings', () => {
  it('returns defaults on first run', async () => {
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('merges patches and persists them', async () => {
    await updateSettings(db, { theme: 'dark' });
    await updateSettings(db, { autoBackup: { enabled: true, intervalHours: 12 } });
    const s = await loadSettings(db);
    expect(s.theme).toBe('dark');
    expect(s.autoBackup).toEqual({ enabled: true, intervalHours: 12 });
  });

  it('rejects invalid values instead of storing them', async () => {
    await expect(updateSettings(db, { autoBackup: { enabled: true, intervalHours: 0 } })).rejects.toThrow();
    expect((await loadSettings(db)).autoBackup.enabled).toBe(false);
  });

  it('fails loudly on a corrupted stored record', async () => {
    await db.settings.put({ key: 'settings', value: { theme: 'neon' } });
    await expect(loadSettings(db)).rejects.toThrow();
  });
});
