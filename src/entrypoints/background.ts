import { browser } from 'wxt/browser';
import { attachAlarmHandler, syncBackupAlarm } from '../background/backupAlarm';
import { attachContextMenuHandler, handleClick, syncContextMenu } from '../background/contextMenu';
import { applyToolbarBehavior } from '../background/toolbar';
import { db } from '../core/instance';
import { saveToInbox } from '../core/quicksave';

/** Re-applies everything that depends on optional permissions or settings. Safe to call repeatedly. */
async function syncAll(): Promise<void> {
  attachAlarmHandler();
  attachContextMenuHandler();
  await Promise.all([syncBackupAlarm(), syncContextMenu(), applyToolbarBehavior()]);
}

export default defineBackground(() => {
  // Listeners must be registered synchronously on every worker start so the browser can wake the worker.
  attachAlarmHandler();
  attachContextMenuHandler();
  // The popup override is not persisted by the browser, so it is re-applied every time the worker starts.
  applyToolbarBehavior().catch((e: unknown) => console.error('Tabarium: applying the toolbar behaviour failed', e));
  browser.runtime.onInstalled.addListener(() => void syncAll());
  browser.runtime.onStartup.addListener(() => void syncAll());
  browser.permissions.onAdded.addListener(() => void syncAll());
  if (import.meta.env.MODE === 'e2e') {
    // Test-only hook: native context menus cannot be clicked by test drivers, so tests invoke the handler here.
    // Compiled out of every other build mode.
    browser.runtime.onMessage.addListener((message: unknown) => {
      const m = message as {
        type?: string;
        info?: Parameters<typeof handleClick>[0];
        tab?: Parameters<typeof handleClick>[1];
        items?: Parameters<typeof saveToInbox>[1];
      };
      if (m.type === 'e2e-save-to-inbox' && m.items) return saveToInbox(db, m.items); // puts links into the Inbox on purpose
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
