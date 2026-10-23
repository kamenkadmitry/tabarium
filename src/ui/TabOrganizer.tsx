import { FolderInput, Plus, Ungroup } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { TAB_GROUP_COLORS, type OpenTab, type OpenWindow, type TabGroupColor, type TabGroupInfo } from '../platform/ports';
import { dragSourceProps, endDrag, getDragPayload } from './dnd';
import { GROUP_COLORS, segmentTabs } from './openTabsModel';
import { TabPill } from './TabPill';
import type { TabsAccess } from './useOpenTabs';

interface Props {
  access: TabsAccess;
  /** False until the optional `tabGroups` permission is granted — groups then read as absent. */
  groupsAccess: boolean;
  windows: readonly OpenWindow[];
  error: string | null;
  selected: ReadonlySet<number>;
  onToggle: (tabId: number) => void;
  onFocus: (tabId: number) => void;
  onCloseTab: (tabId: number) => void;
  onSaveGroup: (tabs: OpenTab[], title: string) => void;
  onMoveToGroup: (tabIds: readonly number[], groupId: number, beforeTabId?: number) => void;
  onMoveToUngrouped: (tabIds: readonly number[], windowId: number, beforeTabId?: number) => void;
  /** Dissolves a browser group while keeping its tabs open. */
  onUngroup: (tabIds: readonly number[]) => void;
  onCreateGroup: (tabIds: readonly number[], windowId: number) => void;
  onUpdateGroup: (groupId: number, patch: { title?: string; color?: TabGroupColor }) => void;
  onGrant: () => void;
  onGrantGroups: () => void;
}

/**
 * Drop position inside a column: the tab id to insert before (resolved by the platform against the real
 * tab strip, which also holds tabs this app cannot see), or null for the column's end.
 */
type Indicator = number | null | undefined;

const column = 'flex w-64 shrink-0 flex-col rounded-xl border border-line bg-surface';
const iconButton =
  'grid size-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg';

/**
 * A window's strip of columns. Scrollbars are hidden; the mouse wheel scrolls it sideways, except over a
 * column's own scrollable list which keeps the wheel for itself.
 */
function WindowRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const vertical = (e.target as HTMLElement).closest('[data-scroll-y]') as HTMLElement | null;
      if (vertical && vertical.scrollHeight > vertical.clientHeight) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div ref={ref} className="no-scrollbar flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1">
      {children}
    </div>
  );
}

/** Reads the drop position under the pointer: the tab row hit and whether it is in its upper half. */
function useColumnDrop(tabs: readonly OpenTab[], onDrop: (payload: { type: 'tabs'; tabIds: number[] }, beforeTabId?: number) => void) {
  const [over, setOver] = useState(false);
  const [indicator, setIndicator] = useState<Indicator>(undefined);
  const clear = () => {
    setOver(false);
    setIndicator(undefined);
  };
  // A drag cancelled while hovering this column (Esc, drop outside the window) fires no dragleave —
  // the highlight and insertion line would stick, so the source's dragend clears them too.
  useEffect(() => {
    if (!over) return;
    const reset = () => {
      setOver(false);
      setIndicator(undefined);
    };
    document.addEventListener('dragend', reset);
    return () => document.removeEventListener('dragend', reset);
  }, [over]);
  return {
    over,
    indicator,
    props: {
      onDragOver: (e: DragEvent) => {
        if (getDragPayload()?.type !== 'tabs') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-open-tab-id]');
        const id = row ? Number(row.dataset.openTabId) : NaN;
        const idx = tabs.findIndex((t) => t.id === id);
        if (!row || idx < 0) {
          setIndicator(null);
          return;
        }
        const rect = row.getBoundingClientRect();
        setIndicator(e.clientY < rect.top + rect.height / 2 ? id : (tabs[idx + 1]?.id ?? null));
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear();
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const payload = endDrag();
        const before = indicator === null ? undefined : indicator;
        clear();
        if (payload?.type === 'tabs') onDrop(payload, before);
      },
    },
  };
}

/** The group's colour dot: opens the nine native browser group colours to recolour the real group. */
function GroupColorDot({ group, onUpdateGroup }: { group: TabGroupInfo; onUpdateGroup: Props['onUpdateGroup'] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Group colour, currently ${group.color}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change colour"
        onClick={() => setOpen((v) => !v)}
        className="grid size-5 place-items-center rounded-md transition-colors duration-150 hover:bg-surface-2"
      >
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: GROUP_COLORS[group.color] ?? GROUP_COLORS.grey }} />
      </button>
      {open && (
        <div role="menu" aria-label="Group colour" className="absolute left-0 top-7 z-20 grid w-32 grid-cols-3 gap-0.5 rounded-xl border border-line bg-surface p-1">
          {TAB_GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={group.color === c}
              aria-label={c}
              title={c}
              onClick={() => {
                if (c !== group.color) onUpdateGroup(group.id, { color: c });
                setOpen(false);
              }}
              className={`grid size-9 place-items-center rounded-lg hover:bg-surface-2 ${group.color === c ? 'bg-surface-2' : ''}`}
            >
              <span className="size-4 rounded-full" style={{ background: GROUP_COLORS[c] }} />
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** One group of browser tabs as a kanban column: colored top edge, inline-renamed title, tab cards. */
function GroupColumn({
  group,
  tabs,
  ...p
}: Props & { group: TabGroupInfo; tabs: OpenTab[] }) {
  const color = GROUP_COLORS[group.color] ?? GROUP_COLORS.grey;
  const [draft, setDraft] = useState<string | null>(null);
  const drop = useColumnDrop(tabs, (payload, beforeTabId) => p.onMoveToGroup(payload.tabIds, group.id, beforeTabId));
  const commit = () => {
    const t = (draft ?? '').trim();
    setDraft(null);
    if (t !== group.title) p.onUpdateGroup(group.id, { title: t });
  };
  return (
    <section
      aria-label={`Tab group ${group.title || 'untitled'}`}
      className={`${column} border-t-4 ${drop.over ? 'ring-2 ring-primary' : ''}`}
      style={{ borderTopColor: color }}
      {...drop.props}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <GroupColorDot group={group} onUpdateGroup={p.onUpdateGroup} />
        {draft !== null ? (
          <input
            autoFocus
            aria-label="Group name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') setDraft(null);
            }}
            onBlur={commit}
            className="min-w-0 flex-1 rounded border border-line bg-bg px-1.5 py-0.5 text-sm font-semibold"
          />
        ) : (
          <button
            type="button"
            aria-label={`Rename group ${group.title || 'untitled'}`}
            title="Rename group"
            onClick={() => setDraft(group.title)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
          >
            {group.title || 'Group'}
          </button>
        )}
        <span className="text-xs text-muted">{tabs.length}</span>
        <button
          type="button"
          aria-label={`Save group ${group.title || 'untitled'} as a collection`}
          title="Save as a collection"
          onClick={() => p.onSaveGroup(tabs, group.title || 'Group')}
          className={iconButton}
        >
          <FolderInput size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Ungroup ${group.title || 'untitled'}`}
          title="Ungroup"
          onClick={() => p.onUngroup(tabs.map((t) => t.id))}
          className={iconButton}
        >
          <Ungroup size={14} aria-hidden />
        </button>
      </header>
      <ul data-scroll-y className="no-scrollbar flex min-h-8 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {tabs.map((t) => (
          <TabPill
            key={t.id}
            tab={t}
            size="roomy"
            selected={p.selected.has(t.id)}
            onToggleSelect={() => p.onToggle(t.id)}
            onActivate={() => p.onFocus(t.id)}
            onClose={() => p.onCloseTab(t.id)}
            dropAbove={drop.indicator === t.id}
            itemProps={dragSourceProps({ type: 'tabs', tabIds: p.selected.has(t.id) ? [...p.selected] : [t.id] })}
          />
        ))}
        {drop.indicator === null && <li aria-hidden className="mx-1 h-0.5 rounded bg-primary" />}
      </ul>
    </section>
  );
}

/** The window's loose tabs: drops ungroup the payload and move it to the position. */
function UngroupedColumn({ w, tabs, windowName, ...p }: Props & { w: OpenWindow; tabs: OpenTab[]; windowName: string }) {
  const drop = useColumnDrop(tabs, (payload, beforeTabId) => p.onMoveToUngrouped(payload.tabIds, w.id, beforeTabId));
  return (
    <section
      aria-label={`Ungrouped tabs of ${windowName}`}
      className={`${column} ${drop.over ? 'ring-2 ring-primary' : ''}`}
      {...drop.props}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">Ungrouped</span>
        <span className="text-xs text-muted">{tabs.length}</span>
      </header>
      <ul data-scroll-y className="no-scrollbar flex min-h-8 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {tabs.map((t) => (
          <TabPill
            key={t.id}
            tab={t}
            size="roomy"
            selected={p.selected.has(t.id)}
            onToggleSelect={() => p.onToggle(t.id)}
            onActivate={() => p.onFocus(t.id)}
            onClose={() => p.onCloseTab(t.id)}
            dropAbove={drop.indicator === t.id}
            itemProps={dragSourceProps({ type: 'tabs', tabIds: p.selected.has(t.id) ? [...p.selected] : [t.id] })}
          />
        ))}
        {drop.indicator === null && <li aria-hidden className="mx-1 h-0.5 rounded bg-primary" />}
      </ul>
    </section>
  );
}

/** The endcap drop zone: tabs dropped here move into this window and form a brand-new, unnamed group. */
function NewGroupZone({ w, onCreateGroup }: { w: OpenWindow } & Pick<Props, 'onCreateGroup'>) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!over) return;
    const reset = () => setOver(false);
    document.addEventListener('dragend', reset);
    return () => document.removeEventListener('dragend', reset);
  }, [over]);
  return (
    <div
      aria-label="New group drop zone"
      className={`flex w-48 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-8 text-sm font-semibold ${
        over ? 'border-primary bg-surface-2 text-fg' : 'border-line text-muted'
      }`}
      onDragOver={(e) => {
        if (getDragPayload()?.type !== 'tabs') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = endDrag();
        if (payload?.type === 'tabs') onCreateGroup(payload.tabIds, w.id);
      }}
    >
      <Plus size={16} aria-hidden /> Drop tabs to group
    </div>
  );
}

/**
 * The full-surface kanban of the browser session: every window's tab groups as columns,
 * tabs dragging between them for real — into, out of, and onto brand-new groups.
 */
export function TabOrganizer(p: Props) {
  return (
    <section aria-label="Tab organizer" className="no-scrollbar flex h-full flex-col gap-5 overflow-y-auto">
      {p.access === 'needed' && (
        <div className="px-2 py-6 text-center">
          <p className="text-sm text-muted">Allow Tabarium to see your open tabs so you can organise them into groups.</p>
          <button
            type="button"
            onClick={p.onGrant}
            className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
          >
            Show open tabs
          </button>
        </div>
      )}
      {p.access === 'checking' && <p className="px-2 py-6 text-center text-sm text-muted">Checking access…</p>}
      {p.error && (
        <p role="alert" className="mx-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-danger">
          {p.error}
        </p>
      )}
      {p.access === 'granted' && !p.groupsAccess && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <p className="flex-1 text-sm text-muted">Grant the tab groups permission to see and manage your browser tab groups here.</p>
          <button
            type="button"
            onClick={p.onGrantGroups}
            className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
          >
            Show tab groups
          </button>
        </div>
      )}
      {p.access === 'granted' && p.windows.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted">No open tabs. Tabs you open will show up here.</p>
      )}
      {p.access === 'granted' &&
        p.windows.map((w, i) => {
          const windowName = w.current ? 'this window' : `window ${i + 1}`;
          const groupRuns = segmentTabs(w).filter((r): r is { group: TabGroupInfo; tabs: OpenTab[] } => r.group !== null);
          const ungrouped = w.tabs.filter((t) => t.groupId === undefined);
          return (
            <div key={w.id} className="flex min-h-56 flex-1 flex-col">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {w.current ? 'This window' : `Window ${i + 1}`} · {w.tabs.length} tabs
              </h3>
              <WindowRow>
                {groupRuns.map((run) => (
                  <GroupColumn key={run.group.id} {...p} group={run.group} tabs={run.tabs} />
                ))}
                <UngroupedColumn {...p} w={w} tabs={ungrouped} windowName={windowName} />
                <NewGroupZone w={w} onCreateGroup={p.onCreateGroup} />
              </WindowRow>
            </div>
          );
        })}
    </section>
  );
}
