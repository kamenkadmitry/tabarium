import { browser } from 'wxt/browser';
import { attachAlarmHandler, syncBackupAlarm } from '../background/backupAlarm';
import { attachContextMenuHandler, syncContextMenu } from '../background/contextMenu';

/** Re-applies everything that depends on optional permissions or settings. Safe to call repeatedly. */
async function syncAll(): Promise<void> {
  attachAlarmHandler();
  attachContextMenuHandler();
  await Promise.all([syncBackupAlarm(), syncContextMenu()]);
}

export default defineBackground(() => {
  // Listeners must be registered synchronously on every worker start so the browser can wake the worker.
  attachAlarmHandler();
  attachContextMenuHandler();
  browser.runtime.onInstalled.addListener(() => void syncAll());
  browser.runtime.onStartup.addListener(() => void syncAll());
  browser.permissions.onAdded.addListener(() => void syncAll());
  // Extension pages ask the worker to re-sync after the user changes a setting.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'sync-settings') {
      return syncAll();
    }
    return undefined;
  });
});
