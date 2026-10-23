import { browser } from 'wxt/browser';

/** Shows a short result on the toolbar icon (e.g. "+1" saved, "=" already there), then clears it. */
export async function flashBadge(text: string): Promise<void> {
  await browser.action.setBadgeText({ text });
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 2500);
}
