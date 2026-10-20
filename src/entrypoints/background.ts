import { browser } from 'wxt/browser';
import { exportBackup } from '../core/backup';
import { db } from '../core/instance';
import { loadSettings, updateSettings } from '../core/settings';
import { backupFilename } from '../platform/files';

const BACKUP_ALARM = 'tabarium-auto-backup';

/** Writes a backup into the Downloads folder. Needs the optional `downloads` permission. */
async function runAutoBackup(): Promise<void> {
  const json = JSON.stringify(await exportBackup(db));
  // Service workers cannot create object URLs, so the payload goes through a data: URL.
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  await browser.downloads.download({ url, filename: `Tabarium/${backupFilename()}`, conflictAction: 'uniquify' });
  await updateSettings(db, { lastBackupAt: Date.now() });
}

/** Aligns the alarm with settings. A no-op until the user has granted `alarms`. */
async function syncBackupAlarm(): Promise<void> {
  if (!browser.alarms) return;
  const { autoBackup } = await loadSettings(db);
  if (!autoBackup.enabled) {
    await browser.alarms.clear(BACKUP_ALARM);
    return;
  }
  await browser.alarms.create(BACKUP_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: autoBackup.intervalHours * 60,
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncBackupAlarm());
  browser.runtime.onStartup.addListener(() => void syncBackupAlarm());
  browser.permissions.onAdded.addListener(() => void syncBackupAlarm());
  // The settings page asks the worker to re-sync after the user changes the schedule.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'sync-backup-alarm') {
      return syncBackupAlarm();
    }
    return undefined;
  });
  // `browser.alarms` is undefined until the optional permission is granted, so the listener is attached lazily.
  let attached = false;
  const attach = () => {
    if (attached || !browser.alarms) return;
    attached = true;
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === BACKUP_ALARM) {
        runAutoBackup().catch((e: unknown) => console.error('Tabarium: auto-backup failed', e));
      }
    });
  };
  attach();
  browser.permissions.onAdded.addListener(attach);
});
