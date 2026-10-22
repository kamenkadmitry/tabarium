import type { ReactNode } from 'react';

/** A friendly empty state: an icon, one line about what lives here, and optionally the primary action. */
export function EmptyState({ icon, title, hint, action, className = '' }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div data-empty-state className={`grid place-items-center px-6 py-8 text-center ${className}`}>
      <span aria-hidden className="text-muted [&_svg]:size-[34px]">
        {icon}
      </span>
      <p className="mt-3 font-bold">{title}</p>
      {hint !== undefined && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
