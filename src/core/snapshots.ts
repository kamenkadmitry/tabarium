import type { TabariumDB } from './db';
import type { SessionSnapshot, SnapshotWindow } from './types';
import type { OpenWindow } from '../platform/ports';

/** How many snapshots are kept; the oldest fall off when a new one lands. */
export const MAX_SNAPSHOTS = 20;

/** The snapshot-worthy view of live windows: saveable tabs only, windows with nothing saveable dropped. */
export function snapshotOfWindows(windows: readonly OpenWindow[]): SnapshotWindow[] {
  return windows
    .map((w) => ({
      tabs: w.tabs.map((tab) => ({
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        ...(tab.groupId !== undefined && { groupId: tab.groupId }),
      })),
      groups: w.groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
    }))
    .filter((w) => w.tabs.length > 0);
}

/** Stores one snapshot and trims the tail past MAX_SNAPSHOTS. Null when there was nothing worth keeping. */
export async function takeSnapshot(db: TabariumDB, windows: readonly OpenWindow[], at = Date.now()): Promise<SessionSnapshot | null> {
  const snapWindows = snapshotOfWindows(windows);
  if (snapWindows.length === 0) return null;
  const snapshot: SessionSnapshot = { id: crypto.randomUUID(), createdAt: at, windows: snapWindows };
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.put(snapshot);
    const stale = await db.snapshots.orderBy('createdAt').reverse().offset(MAX_SNAPSHOTS).primaryKeys();
    if (stale.length > 0) await db.snapshots.bulkDelete(stale);
  });
  return snapshot;
}

/** Snapshots newest first. */
export function listSnapshots(db: TabariumDB): Promise<SessionSnapshot[]> {
  return db.snapshots.orderBy('createdAt').reverse().toArray();
}

export async function deleteSnapshot(db: TabariumDB, id: string): Promise<void> {
  await db.snapshots.delete(id);
}
