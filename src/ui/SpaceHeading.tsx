import { SpaceIcon } from './spaceIcons';

/** Space name with its icon and "N Collections · M tabs" counts. */
export function SpaceHeading({ name, icon, collections, tabs }: { name: string; icon: string | null; collections: number; tabs: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary">
        <SpaceIcon icon={icon} name={name} size={icon ? 18 : 16} />
      </span>
      <h1 className="truncate text-xl font-bold tracking-tight">{name}</h1>
      <p className="hidden shrink-0 text-xs text-muted sm:block">
        {collections} {collections === 1 ? 'Collection' : 'Collections'} <span aria-hidden>·</span> {tabs} {tabs === 1 ? 'tab' : 'tabs'}
      </p>
    </div>
  );
}
