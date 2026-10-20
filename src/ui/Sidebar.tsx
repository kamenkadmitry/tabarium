import { Clock, Layers, Plus, Settings, Star } from 'lucide-react';
import type { Space } from '../core/types';

export type View = { kind: 'space'; spaceId: string } | { kind: 'starred' } | { kind: 'next' } | { kind: 'settings' };

interface Props {
  spaces: readonly Space[];
  view: View | null;
  onSelect: (view: View) => void;
  onCreateSpace: () => void;
}

function NavButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
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
      <span className="truncate">{props.children}</span>
    </button>
  );
}

export function Sidebar({ spaces, view, onSelect, onCreateSpace }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4">
      <div className="flex items-center gap-2 px-1">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg">
          <Layers size={18} aria-hidden />
        </div>
        <span className="text-lg font-bold tracking-tight">Tabarium</span>
      </div>

      <nav aria-label="Library" className="flex flex-col gap-1">
        <NavButton
          active={view?.kind === 'starred'}
          onClick={() => onSelect({ kind: 'starred' })}
          icon={<Star size={18} aria-hidden />}
        >
          Starred
        </NavButton>
        <NavButton
          active={view?.kind === 'next'}
          onClick={() => onSelect({ kind: 'next' })}
          icon={<Clock size={18} aria-hidden />}
        >
          Next
        </NavButton>
      </nav>

      <nav aria-label="Spaces" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Spaces</span>
          <button
            type="button"
            aria-label="Create space"
            onClick={onCreateSpace}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {spaces.map((s) => (
            <NavButton
              key={s.id}
              active={view?.kind === 'space' && view.spaceId === s.id}
              onClick={() => onSelect({ kind: 'space', spaceId: s.id })}
              icon={
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-bold text-primary">
                  {s.name[0]?.toUpperCase()}
                </span>
              }
            >
              {s.name}
            </NavButton>
          ))}
        </div>
      </nav>

      <NavButton
        active={view?.kind === 'settings'}
        onClick={() => onSelect({ kind: 'settings' })}
        icon={<Settings size={18} aria-hidden />}
      >
        Settings
      </NavButton>
    </aside>
  );
}
