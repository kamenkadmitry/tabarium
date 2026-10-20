import { browser } from 'wxt/browser';
import { exportBackup } from '../core/backup';
import { db } from '../core/instance';
import { loadSettings, recordBackup } from '../core/settings';
import { backupFilename } from '../platform/files';

const BACKUP_ALARM = 'tabarium-auto-backup';

/** Writes a backup into the Downloads folder. Needs the optional `downloads` permission. */
async function runAutoBackup(): Promise<void> {
  const json = JSON.stringify(await exportBackup(db));
  // Service workers cannot create object URLs, so the payload goes through a data: URL.
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  await browser.downloads.download({ url, filename: `Tabarium/${backupFilename()}`, conflictAction: 'uniquify' });
  await recordBackup(db);
}

/** Aligns the alarm with settings. A no-op until the user has granted `alarms`. */
export async function syncBackupAlarm(): Promise<void> {
  if (!browser.alarms) return;
  const { autoBackup } = await loadSettings(db);
  if (!autoBackup.enabled) {
    await browser.alarms.clear(BACKUP_ALARM);
    return;
  }
  await browser.alarms.create(BACKUP_ALARM, { delayInMinutes: 1, periodInMinutes: autoBackup.intervalHours * 60 });
}

let attached = false;
/** `browser.alarms` is undefined until the optional permission is granted, so the listener is attached lazily. */
export function attachAlarmHandler(): void {
  if (attached || !browser.alarms) return;
  attached = true;
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM) {
      runAutoBackup().catch((e: unknown) => console.error('Tabarium: auto-backup failed', e));
    }
  });
}
