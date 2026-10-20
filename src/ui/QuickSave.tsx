import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, LibraryBig } from 'lucide-react';
import { useState } from 'react';
import { db } from '../core/instance';
import { loadSettings, updateSettings } from '../core/settings';
import { usePlatform } from '../platform/context';
import { GroupTabsView } from './quick/GroupTabsView';
import { NextQueueView } from './quick/NextQueueView';
import { SaveTabView } from './quick/SaveTabView';

type Status = { tone: 'ok' | 'error'; text: string } | null;
type TabKey = 'save' | 'group' | 'next';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'save', label: 'Save tab' },
  { key: 'group', label: 'Group tabs' },
  { key: 'next', label: 'Next' },
];

/** Compact surface shared by the toolbar popup and the side panel: Save tab, Group tabs and Next. */
export function QuickSave() {
  const platform = usePlatform();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const nexts = useLiveQuery(() => db.nexts.orderBy('position').toArray(), []);
  const [tab, setTab] = useState<TabKey>('save');
  const [status, setStatus] = useState<Status>(null);

  if (!settings || !spaces || !collections || !cards || !nexts) return null;

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

      <div role="tablist" aria-label="Quick actions" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setStatus(null);
            }}
            className={`h-9 rounded-lg text-sm font-semibold transition-colors duration-150 ${
              tab === t.key ? 'bg-surface text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'save' && (
          <SaveTabView
            spaces={spaces}
            collections={collections}
            autoClose={settings.autoCloseTabs}
            onAutoClose={(v) => void updateSettings(db, { autoCloseTabs: v })}
            onStatus={setStatus}
          />
        )}
        {tab === 'group' && <GroupTabsView spaces={spaces} collections={collections} settings={settings} onStatus={setStatus} />}
        {tab === 'next' && <NextQueueView nexts={nexts} cards={cards} onStatus={setStatus} />}
      </div>

      {status && (
        <p role="status" className={`text-sm font-medium ${status.tone === 'ok' ? 'text-primary' : 'text-danger'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
