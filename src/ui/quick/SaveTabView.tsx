import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, repo } from '../../core/instance';
import { setQuickTarget } from '../../core/quicksave';
import type { Collection, Space } from '../../core/types';
import { usePlatform } from '../../platform/context';
import type { OpenTab } from '../../platform/ports';
import { hostOf } from '../CardRow';
import { inputClass } from '../Dialog';
import { type Destination, DestinationPicker } from './DestinationPicker';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cardCounts: ReadonlyMap<string, number>;
  autoClose: boolean;
  onAutoClose: (value: boolean) => void;
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

/** "Saving this tab" card plus a space/collection picker: choosing a collection saves the tab there. */
export function SaveTabView({ spaces, collections, cardCounts, autoClose, onAutoClose, onStatus }: Props) {
  const platform = usePlatform();
  const [tab, setTab] = useState<OpenTab | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [hasTabsAccess, setHasTabsAccess] = useState(true);
  const [version, setVersion] = useState(0);

  // The side panel stays open while the user switches tabs, so the "current tab" follows the browser.
  useEffect(() => platform.tabs.watchActiveTab(() => setVersion((v) => v + 1)), [platform]);

  useEffect(() => {
    let alive = true;
    Promise.all([platform.tabs.getActiveTab(), platform.permissions.has('tabs')])
      .then(([active, granted]) => {
        if (!alive) return;
        setTab(active);
        setHasTabsAccess(granted);
      })
      .catch((e: unknown) => {
        console.error('Tabarium: reading the active tab failed', e);
        if (!alive) return;
        setTab(null);
        onStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
    };
  }, [platform, onStatus, version]);

  const allowTabAccess = async () => {
    try {
      if (await platform.permissions.request('tabs')) setVersion((v) => v + 1);
      else onStatus({ tone: 'error', text: 'Tabarium needs the "tabs" permission to follow the tab you are on.' });
    } catch (e) {
      console.error('Tabarium: requesting the tabs permission failed', e);
      onStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = async (dest: Destination) => {
    if (!tab) return;
    setBusy(true);
    onStatus(null);
    try {
      const collectionId =
        dest.kind === 'collection' ? dest.collectionId : (await repo.createCollection(dest.spaceId, dest.title)).id;
      const added = await repo.addCards(collectionId, [{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      await setQuickTarget(db, collectionId);
      if (autoClose && added.length > 0) await platform.tabs.closeTabs([tab.id]);
      onStatus({ tone: 'ok', text: added.length > 0 ? `Saved to ${dest.label}.` : `Already in ${dest.label}.` });
    } catch (e) {
      console.error('Tabarium: saving the tab failed', e);
      onStatus({ tone: 'error', text: `Saving the tab failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search collections</span>
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collections" className={`${inputClass} pl-9`} />
      </label>

      <section aria-label="Saving this tab">
        <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">Saving this tab</p>
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          {tab === undefined && <p className="text-sm text-muted">Reading the current tab…</p>}
          {tab === null && (
            <div className="text-sm text-muted">
              <p>This page cannot be saved (only http and https pages can).</p>
              {!hasTabsAccess && (
                <button type="button" onClick={() => void allowTabAccess()} className="mt-2 font-semibold text-primary underline">
                  Allow Tabarium to follow the tab you are on
                </button>
              )}
            </div>
          )}
          {tab && (
            <>
              <p className="truncate text-sm font-semibold">{tab.title}</p>
              <p className="truncate text-xs text-muted">{hostOf(tab.url)}</p>
            </>
          )}
        </div>
      </section>

      <div className={busy || !tab ? 'pointer-events-none opacity-50' : undefined}>
        <DestinationPicker spaces={spaces} collections={collections} cardCounts={cardCounts} query={query} onPick={(d) => void save(d)} />
      </div>

      <label className="flex min-h-9 items-center gap-2 px-1 text-sm">
        <input type="checkbox" checked={autoClose} onChange={(e) => onAutoClose(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Close the tab after saving
      </label>
    </div>
  );
}
