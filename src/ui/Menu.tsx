import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Visible label of the button that opens the menu. */
  label: string;
  /** Text read by screen readers, when the visible label alone is not enough. */
  ariaLabel?: string;
  icon: React.ReactNode;
  /** Highlights the button, e.g. while a filter is active. */
  active?: boolean;
  /** Receives a function that closes the menu. */
  children: (close: () => void) => React.ReactNode;
}

/** A button that opens a small popover. Closes on outside click, Escape and when asked by its content. */
export function Menu({ label, ariaLabel, icon, active = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 ${
          active || open ? 'bg-surface-2 text-primary' : 'text-muted hover:text-fg'
        }`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-11 z-20 min-w-48 rounded-xl border border-line bg-surface p-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: { checked?: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role={props.checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={props.checked}
      onClick={props.onClick}
      className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-2 ${
        props.checked ? 'bg-surface-2 font-semibold' : ''
      }`}
    >
      {props.icon}
      <span className="flex-1">{props.children}</span>
    </button>
  );
}
