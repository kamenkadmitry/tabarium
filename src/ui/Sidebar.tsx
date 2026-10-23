import { Bookmark, Copy, Hash, Layers, LayoutDashboard, Pencil, Plus, Settings, Star, Tag, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import type { Settings as AppSettings } from '../core/settings';
import type { Space } from '../core/types';
import { endDrag, getDragPayload, hasExternalLinks, LINKS_MIME } from './dnd';
import { SpaceIcon } from './spaceIcons';

export type View =
  | { kind: 'space'; spaceId: string }
  | { kind: 'dashboard' }
  | { kind: 'starred' }
  | { kind: 'duplicates' }
  | { kind: 'bookmarks' }
  | { kind: 'tags' }
  | { kind: 'hashtags' }
  | { kind: 'settings' }
  | { kind: 'organizer' };

interface Props {
  spaces: readonly Space[];
  profile: AppSettings['profile'];
  view: View | null;
  /** Links waiting in the Inbox. */
  inboxCount: number;
  duplicateCount: number;
  onSelect: (view: View) => void;
  onCreateSpace: () => void;
  onRenameSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  onDropCollection: (collectionId: string, spaceId: string) => void;
  onDropTabs: (tabIds: number[], spaceId: string) => void;
  /** Links dragged from the side panel (raw `dataTransfer` text) were dropped on a space. */
  onDropLinks: (raw: string, spaceId: string) => void;
}

function NavButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onClick}
      className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-150 ${
        props.active ? 'bg-primary text-primary-fg' : 'text-fg hover:bg-surface-2'
      }`}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.children}</span>
      {props.badge ? (
        <span className={`rounded-full px-2 text-xs font-semibold ${props.active ? 'bg-primary-fg/20' : 'bg-surface-2 text-muted'}`}>
          {props.badge}
        </span>
      ) : null}
    </button>
  );
}

function SpaceItem({ space, active, badge, ...p }: { space: Space; active: boolean; badge?: number } & Pick<Props, 'onSelect' | 'onRenameSpace' | 'onDeleteSpace' | 'onDropCollection' | 'onDropTabs' | 'onDropLinks'>) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`group relative rounded-lg ${over ? 'ring-2 ring-primary' : ''}`}
      onDragOver={(e) => {
        const type = getDragPayload()?.type;
        if (type === 'collection' || type === 'tabs' || hasExternalLinks(e)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = endDrag();
        if (payload?.type === 'collection') p.onDropCollection(payload.id, space.id);
        else if (payload?.type === 'tabs') p.onDropTabs(payload.tabIds, space.id);
        else if (!payload && hasExternalLinks(e)) p.onDropLinks(e.dataTransfer.getData(LINKS_MIME), space.id);
      }}
    >
      <NavButton
        active={active}
        badge={badge}
        onClick={() => p.onSelect({ kind: 'space', spaceId: space.id })}
        icon={
          <span className={`grid size-6 shrink-0 place-items-center rounded-md ${active ? 'text-primary-fg' : 'bg-surface-2 text-primary'}`}>
            <SpaceIcon icon={space.icon} name={space.name} size={space.icon ? 16 : 14} />
          </span>
        }
      >
        {space.name}
      </NavButton>
      {space.kind !== 'inbox' && (
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <button type="button" aria-label={`Edit space ${space.name}`} onClick={() => p.onRenameSpace(space)} className="grid size-8 place-items-center rounded-md bg-surface-2 text-muted hover:text-primary">
          <Pencil size={14} aria-hidden />
        </button>
        <button type="button" aria-label={`Delete space ${space.name}`} onClick={() => p.onDeleteSpace(space)} className="grid size-8 place-items-center rounded-md bg-surface-2 text-muted hover:text-danger">
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
      )}
    </div>
  );
}

export function Sidebar(props: Props) {
  const { spaces, view } = props;
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4">
      <div className="flex items-center gap-2 px-1">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg">
          <Layers size={18} aria-hidden />
        </div>
        <span className="text-lg font-bold tracking-tight">Tabarium</span>
      </div>

      <nav aria-label="Library" className="flex flex-col gap-1">
        <NavButton active={view?.kind === 'dashboard'} onClick={() => props.onSelect({ kind: 'dashboard' })} icon={<LayoutDashboard size={18} aria-hidden />}>
          Dashboard
        </NavButton>
        <NavButton active={view?.kind === 'starred'} onClick={() => props.onSelect({ kind: 'starred' })} icon={<Star size={18} aria-hidden />}>
          Starred
        </NavButton>
        <NavButton active={view?.kind === 'duplicates'} onClick={() => props.onSelect({ kind: 'duplicates' })} icon={<Copy size={18} aria-hidden />} badge={props.duplicateCount}>
          Duplicates
        </NavButton>
        <NavButton active={view?.kind === 'bookmarks'} onClick={() => props.onSelect({ kind: 'bookmarks' })} icon={<Bookmark size={18} aria-hidden />}>
          Bookmarks
        </NavButton>
        <NavButton active={view?.kind === 'tags'} onClick={() => props.onSelect({ kind: 'tags' })} icon={<Tag size={18} aria-hidden />}>
          Tags
        </NavButton>
        <NavButton active={view?.kind === 'hashtags'} onClick={() => props.onSelect({ kind: 'hashtags' })} icon={<Hash size={18} aria-hidden />}>
          Hashtags
        </NavButton>
      </nav>

      <nav aria-label="Spaces" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Spaces</span>
          <button
            type="button"
            aria-label="Create space"
            onClick={props.onCreateSpace}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {[...spaces].sort((a, b) => Number(b.kind === 'inbox') - Number(a.kind === 'inbox')).map((s) => (
            <SpaceItem
              key={s.id}
              space={s}
              badge={s.kind === 'inbox' ? props.inboxCount : undefined}
              active={view?.kind === 'space' && view.spaceId === s.id}
              onSelect={props.onSelect}
              onRenameSpace={props.onRenameSpace}
              onDeleteSpace={props.onDeleteSpace}
              onDropCollection={props.onDropCollection}
              onDropTabs={props.onDropTabs}
              onDropLinks={props.onDropLinks}
            />
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-1">
        <NavButton active={view?.kind === 'settings'} onClick={() => props.onSelect({ kind: 'settings' })} icon={<Settings size={18} aria-hidden />}>
          Settings
        </NavButton>
      </div>

      <button
        type="button"
        aria-label="Your profile"
        onClick={() => props.onSelect({ kind: 'settings' })}
        className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
      >
        {props.profile.avatar ? (
          <img src={props.profile.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
            {props.profile.name ? <span className="text-sm font-bold">{props.profile.name[0]?.toUpperCase()}</span> : <User size={18} aria-hidden />}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{props.profile.name || 'My library'}</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">Local</span>
      </button>
    </aside>
  );
}
