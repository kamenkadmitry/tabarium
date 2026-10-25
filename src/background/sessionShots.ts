import { browser } from 'wxt/browser';
import { db } from '../core/instance';
import { loadSettings } from '../core/settings';
import { takeSnapshot } from '../core/snapshots';
import { createChromePlatform } from '../platform/chrome';

const SNAPSHOT_ALARM = 'tabarium-session-snapshot';

/** Reads the current windows through the same port the Open tabs panel uses, then stores a snapshot. */
export async function captureSnapshot(): Promise<void> {
  const windows = await createChromePlatform().tabs.listWindows();
  await takeSnapshot(db, windows);
}

/**
 * Aligns the alarm with settings. A no-op until the user has granted `alarms`, and the snapshot itself
 * needs `tabs` — without it there is nothing readable to record, so the alarm stays off then too.
 */
export async function syncSnapshotAlarm(): Promise<void> {
  if (!browser.alarms) return;
  const { sessionSnapshots } = await loadSettings(db);
  const canReadTabs = browser.permissions ? await browser.permissions.contains({ permissions: ['tabs'] }) : false;
  if (!sessionSnapshots.enabled || !canReadTabs) {
    await browser.alarms.clear(SNAPSHOT_ALARM);
    return;
  }
  await browser.alarms.create(SNAPSHOT_ALARM, { delayInMinutes: sessionSnapshots.intervalMinutes, periodInMinutes: sessionSnapshots.intervalMinutes });
}

let attached = false;
/** `browser.alarms` is undefined until the optional permission is granted, so the listener is attached lazily. */
export function attachSnapshotHandler(): void {
  if (attached || !browser.alarms) return;
  attached = true;
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SNAPSHOT_ALARM) {
      captureSnapshot().catch((e: unknown) => console.error('Tabarium: session snapshot failed', e));
    }
  });
}
