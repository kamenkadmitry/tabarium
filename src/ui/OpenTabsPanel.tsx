import { FolderInput, Group, PanelRightClose, Shrink, Sparkles, X } from 'lucide-react';
import type { OpenTab, OpenWindow } from '../platform/ports';
import type { TabsAccess } from './useOpenTabs';
import { hostOf } from './CardRow';
import { dragSourceProps } from './dnd';
import { GROUP_COLORS, segmentTabs } from './openTabsModel';

const AVATAR_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#a855f7', '#0284c7', '#db2777', '#65a30d'];

function TabFavicon({ tab }: { tab: OpenTab }) {
  if (tab.favIconUrl) return <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" />;
  const host = hostOf(tab.url);
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="grid size-4 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white"
      style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {host[0]?.toUpperCase()}
    </span>
  );
}

const iconButton =
  'grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent';

interface Props {
  access: TabsAccess;
  windows: readonly OpenWindow[];
  error: string | null;
  selected: ReadonlySet<number>;
  autoClose: boolean;
  aiReady: boolean;
  onGrant: () => void;
  onHide: () => void;
  onMerge: () => void;
  onFocus: (tabId: number) => void;
  onCloseTab: (tabId: number) => void;
  onCloseWindow: (windowId: number) => void;
  onToggle: (tabId: number) => void;
  onSaveWindow: (window: OpenWindow, name: string) => void;
  onSaveGroup: (tabs: OpenTab[], title: string) => void;
  onGroupSelected: () => void;
  onOrganiseWindow: (window: OpenWindow) => void;
  onAddSelected: () => void;
  onClearSelection: () => void;
  onAutoClose: (value: boolean) => void;
}

function windowName(w: OpenWindow, index: number, total: number): string {
  if (w.current) return total > 1 ? 'This window' : 'Open tabs';
  return `Window ${index + 1}`;
}

export function OpenTabsPanel(props: Props) {
  const { windows, selected } = props;

  return (
    <aside aria-label="Open tabs" className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface lg:flex">
      <header className="flex items-center gap-1 border-b border-line px-3 py-3">
        <button type="button" aria-label="Hide open tabs" onClick={props.onHide} className={iconButton}>
          <PanelRightClose size={17} aria-hidden />
        </button>
        <h2 className="flex-1 text-sm font-bold">Open tabs</h2>
        <button type="button" aria-label="Merge windows" disabled={windows.length < 2} onClick={props.onMerge} className={iconButton}>
          <Shrink size={17} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {props.access === 'needed' && (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-muted">Allow Tabarium to see your open tabs so you can drag them into collections.</p>
            <button
              type="button"
              onClick={props.onGrant}
              className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
            >
              Show open tabs
            </button>
          </div>
        )}
        {props.access === 'checking' && <p className="px-2 py-6 text-center text-sm text-muted">Checking access…</p>}
        {props.error && (
          <p role="alert" className="mx-2 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-danger">
            {props.error}
          </p>
        )}
        {props.access === 'granted' && windows.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">No open tabs. Tabs you open will show up here.</p>
        )}

        {props.access === 'granted' &&
          windows.map((w, index) => {
            const name = windowName(w, index, windows.length);
            return (
              <section key={w.id} aria-label={name} className="mb-5">
                <div className="flex items-center gap-1 px-2">
                  <h3 className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted">{name}</h3>
                  {!w.current && (
                    <button type="button" aria-label={`Close ${name}`} onClick={() => props.onCloseWindow(w.id)} className={`${iconButton} size-6`}>
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  <span className="flex-1 text-xs text-muted">
                    {w.tabs.length} tab{w.tabs.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Save ${name} as a collection`}
                    disabled={w.tabs.length === 0}
                    onClick={() => props.onSaveWindow(w, name)}
                    className={`${iconButton} size-7`}
                  >
                    <FolderInput size={15} aria-hidden />
                  </button>
                  {props.aiReady && (
                    <button
                      type="button"
                      aria-label={`Organise ${name} with AI`}
                      disabled={w.tabs.length === 0}
                      onClick={() => props.onOrganiseWindow(w)}
                      className={`${iconButton} size-7`}
                    >
                      <Sparkles size={15} aria-hidden />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {segmentTabs(w).map((run, runIndex) => (
                    <div key={`${run.group?.id ?? 'none'}-${runIndex}`} role={run.group ? 'group' : undefined} aria-label={run.group ? `Tab group ${run.group.title || 'untitled'}` : undefined}>
                      {run.group && (
                        <div className="mb-1 flex items-center gap-2 px-2 pt-1">
                          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: GROUP_COLORS[run.group.color] ?? GROUP_COLORS.grey }} />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{run.group.title || 'Group'}</span>
                          <span className="text-xs text-muted">{run.tabs.length}</span>
                          <button
                            type="button"
                            aria-label={`Save group ${run.group.title || 'untitled'} as a collection`}
                            onClick={() => props.onSaveGroup(run.tabs, run.group?.title || 'Group')}
                            className={`${iconButton} size-6`}
                          >
                            <FolderInput size={13} aria-hidden />
                          </button>
                        </div>
                      )}
                      <ul className={`flex flex-col gap-1 ${run.group ? 'ml-2 border-l-2 pl-1.5' : ''}`} style={run.group ? { borderColor: GROUP_COLORS[run.group.color] ?? GROUP_COLORS.grey } : undefined}>
                        {run.tabs.map((t) => {
                          const isSelected = selected.has(t.id);
                          // Dragging a selected tab takes the whole selection with it.
                          const tabIds = isSelected ? [...selected] : [t.id];
                          return (
                            <li
                              key={t.id}
                              {...dragSourceProps({ type: 'tabs', tabIds })}
                              data-open-tab-id={t.id}
                              className={`group flex min-h-9 items-center gap-2 rounded-lg border px-2 transition-colors duration-150 ${
                                isSelected ? 'border-primary bg-surface-2' : 'border-transparent bg-bg hover:bg-surface-2'
                              }`}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Select ${t.title}`}
                                checked={isSelected}
                                onChange={() => props.onToggle(t.id)}
                                className="size-3.5 shrink-0 accent-[var(--primary)]"
                              />
                              <TabFavicon tab={t} />
                              <button
                                type="button"
                                title={`${t.title}\n${t.url}`}
                                onClick={() => props.onFocus(t.id)}
                                className="min-w-0 flex-1 truncate py-1.5 text-left text-xs font-medium"
                              >
                                {t.title}
                              </button>
                              <button
                                type="button"
                                aria-label={`Close tab ${t.title}`}
                                onClick={() => props.onCloseTab(t.id)}
                                className="grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-opacity duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                              >
                                <X size={13} aria-hidden />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Selected tabs" className="flex flex-col gap-2 border-t border-line bg-surface-2 p-3">
          <p className="text-xs font-semibold">
            {selected.size} tab{selected.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onAddSelected}
              className="h-9 flex-1 rounded-lg bg-primary text-xs font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
            >
              Add to collection
            </button>
            <button
              type="button"
              onClick={props.onGroupSelected}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-150 hover:bg-surface"
            >
              <Group size={13} aria-hidden /> Group
            </button>
            <button
              type="button"
              onClick={props.onClearSelection}
              className="h-9 rounded-lg border border-line px-3 text-xs font-semibold transition-colors duration-150 hover:bg-surface"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-line px-3 py-2.5">
        <label className="flex min-h-8 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={props.autoClose}
            onChange={(e) => props.onAutoClose(e.target.checked)}
            className="size-3.5 accent-[var(--primary)]"
          />
          Close tabs after adding them
        </label>
      </footer>
    </aside>
  );
}
