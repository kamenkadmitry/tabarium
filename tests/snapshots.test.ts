import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { loadSettings, updateSettings } from '../src/core/settings';
import { deleteSnapshot, listSnapshots, MAX_SNAPSHOTS, snapshotOfWindows, takeSnapshot } from '../src/core/snapshots';
import type { OpenTab, OpenWindow } from '../src/platform/ports';

let db: TabariumDB;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
});

const tab = (id: number, url = `https://example.test/${id}`): OpenTab => ({ id, title: `Tab ${id}`, url, favIconUrl: null });

const win = (id: number, tabs: OpenTab[], current = false): OpenWindow => ({ id, current, tabs, groups: [] });

describe('snapshotOfWindows', () => {
  it('keeps tabs and groups of every window that has tabs', () => {
    const windows: OpenWindow[] = [
      { ...win(1, [tab(1), tab(2)]), groups: [{ id: 9, title: 'Docs', color: 'blue' }] },
      win(2, [tab(3)]),
    ];
    const result = snapshotOfWindows(windows);
    expect(result).toHaveLength(2);
    expect(result[0]?.tabs.map((x) => x.url)).toEqual(['https://example.test/1', 'https://example.test/2']);
    expect(result[0]?.groups).toEqual([{ id: 9, title: 'Docs', color: 'blue' }]);
  });

  it('drops windows with nothing saveable and strips runtime-only fields', () => {
    const result = snapshotOfWindows([win(1, []), win(2, [tab(1, 'https://a.test')])]);
    expect(result).toHaveLength(1);
    expect(result[0]?.tabs[0]).toEqual({ title: 'Tab 1', url: 'https://a.test', favIconUrl: null });
  });

  it('remembers the group a tab belonged to', () => {
    const result = snapshotOfWindows([{ ...win(1, [{ ...tab(1), groupId: 5 }]), groups: [{ id: 5, title: 'Work', color: 'red' }] }]);
    expect(result[0]?.tabs[0]?.groupId).toBe(5);
  });
});

describe('takeSnapshot', () => {
  it('stores a snapshot and lists it newest first', async () => {
    const older = await takeSnapshot(db, [win(1, [tab(1)])], 1000);
    const newer = await takeSnapshot(db, [win(1, [tab(1), tab(2)])], 2000);
    expect(older?.createdAt).toBe(1000);
    expect(newer?.createdAt).toBe(2000);
    const list = await listSnapshots(db);
    expect(list.map((s) => s.id)).toEqual([newer?.id, older?.id]);
  });

  it('returns null and stores nothing when no window has saveable tabs', async () => {
    expect(await takeSnapshot(db, [win(1, [])])).toBeNull();
    expect(await listSnapshots(db)).toEqual([]);
  });

  it(`keeps at most ${MAX_SNAPSHOTS} snapshots, dropping the oldest`, async () => {
    for (let i = 1; i <= MAX_SNAPSHOTS + 3; i++) {
      await takeSnapshot(db, [win(1, [tab(1, `https://example.test/${i}`)])], i);
    }
    const list = await listSnapshots(db);
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    // The three oldest runs are gone; the freshest survives first.
    expect(list[0]?.createdAt).toBe(MAX_SNAPSHOTS + 3);
    expect(list[MAX_SNAPSHOTS - 1]?.createdAt).toBe(4);
  });
});

describe('deleteSnapshot', () => {
  it('removes only the given snapshot', async () => {
    const keep = await takeSnapshot(db, [win(1, [tab(1)])], 1);
    const gone = await takeSnapshot(db, [win(1, [tab(2)])], 2);
    await deleteSnapshot(db, gone!.id);
    expect((await listSnapshots(db)).map((s) => s.id)).toEqual([keep?.id]);
  });
});

describe('session snapshot settings', () => {
  it('defaults to disabled with a 15-minute interval', async () => {
    expect((await loadSettings(db)).sessionSnapshots).toEqual({ enabled: false, intervalMinutes: 15 });
  });

  it('stores the enabled flag and interval', async () => {
    await updateSettings(db, { sessionSnapshots: { enabled: true, intervalMinutes: 30 } });
    expect((await loadSettings(db)).sessionSnapshots).toEqual({ enabled: true, intervalMinutes: 30 });
  });

  it('rejects a sub-minute interval instead of storing it', async () => {
    await expect(updateSettings(db, { sessionSnapshots: { enabled: true, intervalMinutes: 0 } })).rejects.toThrow();
  });
});
