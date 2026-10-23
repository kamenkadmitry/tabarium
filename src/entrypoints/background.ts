import { browser } from 'wxt/browser';
import { attachAlarmHandler, syncBackupAlarm } from '../background/backupAlarm';
import { attachCommandHandler, runCommand, saveActiveTab } from '../background/commands';
import { attachContextMenuHandler, handleClick, syncContextMenu } from '../background/contextMenu';
import { applyToolbarBehavior } from '../background/toolbar';
import { db, repo } from '../core/instance';
import { saveToInbox } from '../core/quicksave';

/** Re-applies everything that depends on optional permissions or settings. Safe to call repeatedly. */
async function syncAll(): Promise<void> {
  attachAlarmHandler();
  attachContextMenuHandler();
  attachCommandHandler();
  await Promise.all([syncBackupAlarm(), syncContextMenu(), applyToolbarBehavior()]);
}

export default defineBackground(() => {
  // Listeners must be registered synchronously on every worker start so the browser can wake the worker.
  attachAlarmHandler();
  attachContextMenuHandler();
  attachCommandHandler();
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
        name?: string;
      };
      if (m.type === 'e2e-save-to-inbox' && m.items) return saveToInbox(db, m.items); // puts links into the Inbox on purpose
      if (m.type === 'e2e-save-current-tab') return saveActiveTab(); // real key presses can't reach the commands API from tests
      if (m.type === 'e2e-invoke-command' && typeof m.name === 'string') return runCommand(m.name);
      if (m.type === 'e2e-ensure-hashtag' && typeof m.name === 'string') return repo.ensureHashtag(m.name); // seeds a label the UI can't create headlessly
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
