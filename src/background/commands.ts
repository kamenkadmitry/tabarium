import { browser } from 'wxt/browser';
import { db } from '../core/instance';
import { quickSave } from '../core/quicksave';
import { flashBadge } from './badge';

export const SAVE_TAB_COMMAND = 'save-current-tab';

/** Saves the focused web tab into the quick-save collection and flashes the result on the toolbar icon. */
export async function saveActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) return;
  const added = await quickSave(db, [{ title: tab.title ?? tab.url, url: tab.url, favIconUrl: tab.favIconUrl ?? null }]);
  await flashBadge(added > 0 ? '+1' : '=');
}

let attached = false;
/** The commands API needs no permission, so the listener is attached eagerly on every worker start. */
export function attachCommandHandler(): void {
  if (attached || !browser.commands) return;
  attached = true;
  browser.commands.onCommand.addListener((name) => {
    if (name === SAVE_TAB_COMMAND) {
      saveActiveTab().catch((e: unknown) => console.error('Tabarium: command save failed', e));
    }
  });
}
