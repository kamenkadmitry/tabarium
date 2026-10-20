import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, Layers, LibraryBig } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../core/instance';
import { quickSave, setQuickTarget } from '../core/quicksave';
import { loadSettings } from '../core/settings';
import { usePlatform } from '../platform/context';
import type { OpenTab } from '../platform/ports';
import { hostOf } from './CardRow';
import { inputClass } from './Dialog';

type Status = { tone: 'ok' | 'error'; text: string } | null;

/** Compact save surface shared by the toolbar popup and the side panel. */
export function QuickSave() {
  const platform = usePlatform();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const [tab, setTab] = useState<OpenTab | null | undefined>(undefined);
  const [closeAfter, setCloseAfter] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platform.tabs
      .getActiveTab()
      .then(setTab)
      .catch((e: unknown) => {
        console.error('Tabarium: reading the active tab failed', e);
        setTab(null);
        setStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      });
  }, [platform]);

  if (!settings || !spaces || !collections) return null;

  const run = async (what: string, action: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ tone: 'ok', text: await action() });
    } catch (e) {
      console.error(`Tabarium: ${what} failed`, e);
      setStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const saveThisTab = () =>
    run('Saving the tab', async () => {
      if (!tab) throw new Error('This page cannot be saved.');
      const added = await quickSave(db, [{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      if (closeAfter && added > 0) await platform.tabs.closeTabs([tab.id]);
      return added > 0 ? 'Saved.' : 'Already in this collection.';
    });

  const saveAllTabs = () =>
    run('Saving the tabs', async () => {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read all open tabs.');
      }
      const tabs = await platform.tabs.listWindowTabs();
      const added = await quickSave(
        db,
        tabs.map((t) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl })),
      );
      if (closeAfter && tabs.length > 0) await platform.tabs.closeTabs(tabs.map((t) => t.id));
      return `Saved ${added} of ${tabs.length} tabs.`;
    });

  const target = settings.quickSaveCollectionId ?? '';

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg">
          <Layers size={18} aria-hidden />
        </div>
        <span className="flex-1 text-lg font-bold tracking-tight">Tabarium</span>
        <button
          type="button"
          onClick={() => void platform.tabs.openLibrary()}
          className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2"
        >
          <LibraryBig size={15} aria-hidden /> Open library
        </button>
      </header>

      <section aria-label="Current tab" className="rounded-xl border border-line bg-surface p-3">
        {tab === undefined && <p className="text-sm text-muted">Reading the current tab…</p>}
        {tab === null && <p className="text-sm text-muted">This page cannot be saved (only http and https pages can).</p>}
        {tab && (
          <>
            <p className="truncate text-sm font-semibold">{tab.title}</p>
            <p className="truncate text-xs text-muted">{hostOf(tab.url)}</p>
          </>
        )}
      </section>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Save to</span>
        <select
          value={target}
          onChange={(e) => {
            if (e.target.value !== '') void run('Choosing the collection', async () => {
              await setQuickTarget(db, e.target.value);
              return 'Destination updated.';
            });
          }}
          className={inputClass}
        >
          {target === '' && <option value="">Inbox / Saved tabs (default)</option>}
          {spaces.map((s) => (
            <optgroup key={s.id} label={s.name}>
              {collections
                .filter((c) => c.spaceId === s.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={closeAfter} onChange={(e) => setCloseAfter(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Close tabs after saving
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy || !tab}
          onClick={() => void saveThisTab()}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
        >
          <BookmarkPlus size={16} aria-hidden /> Save this tab
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveAllTabs()}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
        >
          Save all tabs in this window
        </button>
      </div>

      {status && (
        <p role="status" className={`text-sm font-medium ${status.tone === 'ok' ? 'text-primary' : 'text-danger'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
