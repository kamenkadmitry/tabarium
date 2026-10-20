/** Browser capabilities that need a user-granted permission. Everything is optional in the manifest. */
export type Capability =
  | 'tabs'
  | 'contextMenus'
  | 'sidePanel'
  | 'downloads'
  | 'alarms'
  | 'tabGroups'
  | 'history';

export interface OpenTab {
  id: number;
  title: string;
  url: string;
  favIconUrl: string | null;
}

export interface OpenOptions {
  groupTitle?: string;
}

export interface PermissionsPort {
  has(capability: Capability): Promise<boolean>;
  /** Must be called from a user gesture (click handler). Resolves to whether the user granted it. */
  request(capability: Capability): Promise<boolean>;
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
  /** Opens (or focuses) the full Tabarium page. */
  openLibrary(): Promise<void>;
}

export interface BackupSchedulePort {
  /** Tells the background worker to re-read the auto-backup settings and (re)create or clear its alarm. */
  resync(): Promise<void>;
}

export interface Platform {
  permissions: PermissionsPort;
  tabs: TabsPort;
  backupSchedule: BackupSchedulePort;
}
