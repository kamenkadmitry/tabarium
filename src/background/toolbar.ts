import { browser } from 'wxt/browser';
import { db } from '../core/instance';
import { loadSettings } from '../core/settings';

/**
 * Makes the toolbar button open the side panel (default) or the classic popup, as chosen in Settings.
 * The popup stays declared in the manifest; an empty popup lets the click open the side panel instead.
 * Where the side panel API is missing (older Chrome) the popup remains in use.
 */
export async function applyToolbarBehavior(): Promise<void> {
  const { quickPanel } = await loadSettings(db);
  const side = quickPanel === 'side' && browser.sidePanel !== undefined;
  await browser.action.setPopup({ popup: side ? '' : 'popup.html' });
  if (browser.sidePanel) await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: side });
}
