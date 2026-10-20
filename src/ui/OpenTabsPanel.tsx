import { Group, PanelRightClose, Shrink } from 'lucide-react';
import { useRef } from 'react';
import type { OpenTab, OpenWindow } from '../platform/ports';
import { TabsByWindow } from './TabsByWindow';
import type { TabsAccess } from './useOpenTabs';

const iconButton =
  'grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent';

interface Props {
  /** Current width in pixels. */
  width: number;
  /** Called continuously while the edge is dragged. */
  onResize: (width: number) => void;
  /** Called once when dragging ends, with the final width, so it can be saved. */
  onResizeEnd: (width: number) => void;
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

export const PANEL_MIN_WIDTH = 220;
export const PANEL_MAX_WIDTH = 640;
const clampWidth = (w: number) => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(w)));

export function OpenTabsPanel(props: Props) {
  const { windows, selected } = props;
  const dragging = useRef(false);

  const keyResize = (e: React.KeyboardEvent) => {
    // The panel is on the right, so moving its left edge to the left makes it wider.
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') props.onResizeEnd(clampWidth(props.width + step));
    else if (e.key === 'ArrowRight') props.onResizeEnd(clampWidth(props.width - step));
    else return;
    e.preventDefault();
  };

  return (
    <aside aria-label="Open tabs" style={{ width: props.width }} className="relative hidden shrink-0 flex-col border-l border-line bg-surface lg:flex">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the open tabs panel"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={props.width}
        tabIndex={0}
        onKeyDown={keyResize}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragging.current) props.onResize(clampWidth(window.innerWidth - e.clientX));
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
          props.onResizeEnd(clampWidth(window.innerWidth - e.clientX));
        }}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors duration-150 hover:bg-primary/30 focus-visible:bg-primary/40"
      />
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

        {props.access === 'granted' && (
          <TabsByWindow
            windows={windows}
            selected={selected}
            draggable
            onToggle={props.onToggle}
            onFocus={props.onFocus}
            onCloseTab={props.onCloseTab}
            onCloseWindow={props.onCloseWindow}
            onSaveWindow={props.onSaveWindow}
            onSaveGroup={props.onSaveGroup}
            onOrganiseWindow={props.aiReady ? props.onOrganiseWindow : undefined}
          />
        )}
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
