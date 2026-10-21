import type { BookmarkNode } from '../core/bookmarks';

/** Browser capabilities that need a user-granted permission. Everything is optional in the manifest. */
export type Capability =
  | 'tabs'
  | 'contextMenus'
  | 'sidePanel'
  | 'downloads'
  | 'alarms'
  | 'tabGroups'
  | 'history'
  | 'bookmarks';

export interface OpenTab {
  id: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  /** Browser tab group this tab belongs to, when it is in one. */
  groupId?: number;
  /** The tab that is currently shown in its window. */
  active?: boolean;
}

/** The fixed colours of browser tab groups. */
export const TAB_GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'] as const;
export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export interface TabGroupInfo {
  id: number;
  title: string;
  /** One of the browser's fixed group colours ("blue", "red", ...). */
  color: string;
}

export interface OpenOptions {
  groupTitle?: string;
}

export interface OpenWindow {
  id: number;
  /** The window that shows the library. */
  current: boolean;
  /** Saveable (http/https) tabs only, in tab-strip order. */
  tabs: OpenTab[];
  /** Browser tab groups in this window. Empty until the optional `tabGroups` permission is granted. */
  groups: TabGroupInfo[];
}

export interface PermissionsPort {
  has(capability: Capability): Promise<boolean>;
  /** Must be called from a user gesture (click handler). Resolves to whether the user granted it. */
  request(capability: Capability): Promise<boolean>;
  /** Asks for access to one web origin (e.g. an AI provider). Must be called from a user gesture. */
  requestOrigin(origin: string): Promise<boolean>;
  /** Whether Tabarium may read any website (needed to read descriptions of saved pages). */
  hasAllSites(): Promise<boolean>;
  /** Asks for access to every website. Must run from a click. */
  requestAllSites(): Promise<boolean>;
}

export interface TabsPort {
  /** Saveable (http/https) tabs of the current window. Requires the `tabs` permission. */
  listWindowTabs(): Promise<OpenTab[]>;
  closeTabs(ids: readonly number[]): Promise<void>;
  /** Opens the URLs in background tabs; with `groupTitle` they are put in a tab group (needs `tabGroups`). */
  openUrls(urls: readonly string[], options?: OpenOptions): Promise<void>;
  /** Opens the URLs, then closes every other tab of the current window except the Tabarium page itself. Needs `tabs`. */
  replaceWindowTabs(urls: readonly string[], options?: OpenOptions): Promise<void>;
  /** The focused tab of the current window, or null if it is not a web page. Works via `activeTab` when the popup opens. */
  getActiveTab(): Promise<OpenTab | null>;
  /** All normal browser windows with their saveable tabs. Requires the `tabs` permission. */
  listWindows(): Promise<OpenWindow[]>;
  /** Puts the tabs into a new browser tab group per window (needs `tabGroups`). */
  groupTabs(tabIds: readonly number[], title: string, color?: TabGroupColor): Promise<void>;
  /** Calls `listener` when the focused tab or its title/address changes; returns an unsubscribe function. */
  watchActiveTab(listener: () => void): () => void;
  /** Brings a tab (and its window) to the front. */
  focusTab(tabId: number): Promise<void>;
  closeWindow(windowId: number): Promise<void>;
  /** Moves the tabs of every other window into the current one and closes the emptied windows. */
  mergeWindows(): Promise<void>;
  /** Calls `listener` whenever tabs or windows change; returns an unsubscribe function. */
  watch(listener: () => void): () => void;
  /** Opens (or focuses) the full Tabarium page. */
  openLibrary(): Promise<void>;
}

export interface BookmarksPort {
  /** The browser's bookmark tree (a nameless root whose children are the top-level folders). Needs `bookmarks`. */
  getTree(): Promise<BookmarkNode[]>;
  /** Removes bookmarks and empty folders, one by one, in the given order. Needs `bookmarks`. */
  remove(ids: readonly string[]): Promise<void>;
}

export interface BackupSchedulePort {
  /** Tells the background worker to re-read the auto-backup settings and (re)create or clear its alarm. */
  resync(): Promise<void>;
}

export interface Platform {
  permissions: PermissionsPort;
  tabs: TabsPort;
  backupSchedule: BackupSchedulePort;
  bookmarks: BookmarksPort;
}
