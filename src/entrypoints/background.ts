import { browser } from 'wxt/browser';
import { attachAlarmHandler, syncBackupAlarm } from '../background/backupAlarm';
import { attachContextMenuHandler, handleClick, syncContextMenu } from '../background/contextMenu';

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
  if (import.meta.env.MODE === 'e2e') {
    // Test-only hook: native context menus cannot be clicked by test drivers, so tests invoke the handler here.
    // Compiled out of every other build mode.
    browser.runtime.onMessage.addListener((message: unknown) => {
      const m = message as { type?: string; info?: Parameters<typeof handleClick>[0]; tab?: Parameters<typeof handleClick>[1] };
      return m.type === 'e2e-context-click' && m.info ? handleClick(m.info, m.tab) : undefined;
    });
  }
  // Extension pages ask the worker to re-sync after the user changes a setting.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'sync-settings') {
      return syncAll();
    }
    return undefined;
  });
});
