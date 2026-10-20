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

export interface PermissionsPort {
  has(capability: Capability): Promise<boolean>;
  /** Must be called from a user gesture (click handler). Resolves to whether the user granted it. */
  request(capability: Capability): Promise<boolean>;
}

export interface TabsPort {
  /** Saveable (http/https) tabs of the current window. Requires the `tabs` permission. */
  listWindowTabs(): Promise<OpenTab[]>;
  closeTabs(ids: readonly number[]): Promise<void>;
  openUrls(urls: readonly string[]): Promise<void>;
}

export interface Platform {
  permissions: PermissionsPort;
  tabs: TabsPort;
}
