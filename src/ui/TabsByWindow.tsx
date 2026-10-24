import { FolderInput, Sparkles, X } from 'lucide-react';
import { useT } from '../i18n/I18nProvider';
import type { T } from '../i18n/messages';
import type { OpenTab, OpenWindow } from '../platform/ports';
import { dragSourceProps, linkDragProps } from './dnd';
import { GROUP_COLORS, segmentTabs } from './openTabsModel';
import { TabPill } from './TabPill';

const iconButton =
  'grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent';

export function windowName(t: T, w: OpenWindow, index: number, total: number): string {
  if (w.current) return total > 1 ? t('otp.windowName.thisWindow') : t('otp.windowName.openTabs');
  return t('otp.windowName.n', { n: index + 1 });
}

interface Props {
  windows: readonly OpenWindow[];
  selected: ReadonlySet<number>;
  onToggle: (tabId: number) => void;
  onFocus?: (tabId: number) => void;
  onCloseTab?: (tabId: number) => void;
  onCloseWindow?: (windowId: number) => void;
  onSaveWindow?: (window: OpenWindow, name: string) => void;
  onOrganiseWindow?: (window: OpenWindow) => void;
  onSaveGroup?: (tabs: OpenTab[], title: string) => void;
  /** Tabs can be dragged out (into the board); a selected tab drags the whole selection. */
  draggable?: boolean;
  /** Drag the pages themselves as links, for dropping into the library from another page (the side panel). */
  dragAsLinks?: boolean;
  size?: 'compact' | 'roomy';
}

/** Browser windows as blocks, each with its tab groups and tab chips. Used by the library panel and the side panel. */
export function TabsByWindow(props: Props) {
  const t = useT();
  const { windows, selected } = props;
  return (
    <>
      {windows.map((w, index) => {
        const name = windowName(t, w, index, windows.length);
        return (
          <section key={w.id} aria-label={name} className="mb-5">
            <div className="flex items-center gap-1 px-2">
              <h3 className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted">{name}</h3>
              {props.onCloseWindow && !w.current && (
                <button type="button" aria-label={t('otp.closeWindow', { name })} onClick={() => props.onCloseWindow?.(w.id)} className={`${iconButton} size-6`}>
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 px-2 pb-1.5">
              <span className="flex-1 text-xs text-muted">
                {t.plural('count.tabs', w.tabs.length)}
              </span>
              {props.onSaveWindow && (
                <button
                  type="button"
                  aria-label={t('otp.saveWindow', { name })}
                  disabled={w.tabs.length === 0}
                  onClick={() => props.onSaveWindow?.(w, name)}
                  className={`${iconButton} size-7`}
                >
                  <FolderInput size={15} aria-hidden />
                </button>
              )}
              {props.onOrganiseWindow && (
                <button
                  type="button"
                  aria-label={t('otp.organiseWindow', { name })}
                  disabled={w.tabs.length === 0}
                  onClick={() => props.onOrganiseWindow?.(w)}
                  className={`${iconButton} size-7`}
                >
                  <Sparkles size={15} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {segmentTabs(w).map((run, runIndex) => {
                const color = run.group ? (GROUP_COLORS[run.group.color] ?? GROUP_COLORS.grey) : undefined;
                return (
                  <div
                    key={`${run.group?.id ?? 'none'}-${runIndex}`}
                    role={run.group ? 'group' : undefined}
                    aria-label={run.group ? t('otp.groupAria', { title: run.group.title || t('org.untitled') }) : undefined}
                  >
                    {run.group && (
                      <div className="mb-1 flex items-center gap-2 px-2 pt-1">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{run.group.title || t('org.group')}</span>
                        <span className="text-xs text-muted">{run.tabs.length}</span>
                        {props.onSaveGroup && (
                          <button
                            type="button"
                            aria-label={t('otp.saveGroup', { title: run.group.title || t('org.untitled') })}
                            onClick={() => props.onSaveGroup?.(run.tabs, run.group?.title || t('org.group'))}
                            className={`${iconButton} size-6`}
                          >
                            <FolderInput size={13} aria-hidden />
                          </button>
                        )}
                      </div>
                    )}
                    <ul className={`flex flex-col gap-1 ${run.group ? 'ml-2 border-l-2 pl-1.5' : ''}`} style={color ? { borderColor: color } : undefined}>
                      {run.tabs.map((t) => {
                        const isSelected = selected.has(t.id);
                        const tabIds = isSelected ? [...selected] : [t.id];
                        return (
                          <TabPill
                            key={t.id}
                            tab={t}
                            size={props.size}
                            selected={isSelected}
                            onToggleSelect={() => props.onToggle(t.id)}
                            onActivate={props.onFocus ? () => props.onFocus?.(t.id) : undefined}
                            onClose={props.onCloseTab ? () => props.onCloseTab?.(t.id) : undefined}
                            itemProps={
                              props.dragAsLinks
                                ? linkDragProps(
                                    (isSelected ? windows.flatMap((x) => x.tabs).filter((x) => selected.has(x.id)) : [t]).map((x) => ({
                                      title: x.title,
                                      url: x.url,
                                      favIconUrl: x.favIconUrl,
                                    })),
                                  )
                                : props.draggable
                                  ? dragSourceProps({ type: 'tabs', tabIds })
                                  : undefined
                            }
                          />
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
