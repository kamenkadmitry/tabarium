import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, LibraryBig, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '../core/instance';
import { ensureInbox, inboxCards, inboxSpace } from '../core/quicksave';
import { loadSettings, updateSettings } from '../core/settings';
import type { Card } from '../core/types';
import { usePlatform } from '../platform/context';
import { buildLabelsApi } from './labelsApi';
import { GroupTabsView } from './quick/GroupTabsView';
import { InboxView } from './quick/InboxView';
import { SaveTabView } from './quick/SaveTabView';

type Status = { tone: 'ok' | 'error'; text: string } | null;
type TabKey = 'save' | 'group' | 'inbox';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'save', label: 'Save tab' },
  { key: 'group', label: 'Group tabs' },
  { key: 'inbox', label: 'Inbox' },
];

/** Compact surface shared by the side panel (default toolbar action) and the classic popup. */
export function QuickSave({ surface }: { surface: 'popup' | 'sidepanel' }) {
  const platform = usePlatform();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const spaces = useLiveQuery(() => db.spaces.orderBy('position').toArray(), []);
  const collections = useLiveQuery(() => db.collections.orderBy('position').toArray(), []);
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const tags = useLiveQuery(() => db.tags.orderBy('position').toArray(), []);
  const hashtags = useLiveQuery(() => db.hashtags.orderBy('name').toArray(), []);
  const [tab, setTab] = useState<TabKey>('save');
  const [status, setStatus] = useState<Status>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Makes sure the Inbox exists (and adopts an older one) so its tab has something to show.
  useEffect(() => {
    ensureInbox(db).catch((e: unknown) => {
      console.error('Tabarium: preparing the Inbox failed', e);
      setStatus({ tone: 'error', text: `Preparing the Inbox failed: ${e instanceof Error ? e.message : String(e)}` });
    });
  }, []);

  if (!settings || !spaces || !collections || !cards || !tags || !hashtags) return null;

  const cardsByCollection = new Map<string, Card[]>();
  for (const c of cards) cardsByCollection.set(c.collectionId, [...(cardsByCollection.get(c.collectionId) ?? []), c]);

  // What waits in the Inbox (all its collections), newest first. Moving a link out or removing it takes it off this list.
  const inbox = inboxSpace(spaces);
  const inboxItems = inboxCards(spaces, collections, cards).sort((a, b) => b.createdAt - a.createdAt);
  const inboxCollectionIds = new Set(collections.filter((c) => c.spaceId === inbox?.id).map((c) => c.id));

  const chooseToolbar = async (quickPanel: 'side' | 'popup') => {
    try {
      await updateSettings(db, { quickPanel });
      await platform.backupSchedule.resync();
      setStatus({
        tone: 'ok',
        text: quickPanel === 'popup' ? 'The toolbar button now opens the classic popup.' : 'The toolbar button now opens the side panel.',
      });
    } catch (e) {
      console.error('Tabarium: switching the toolbar behaviour failed', e);
      setStatus({ tone: 'error', text: `Switching failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex shrink-0 items-center gap-2">
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

      {surface === 'sidepanel' && settings.quickPanel === 'side' && !bannerDismissed && (
        <p className="flex shrink-0 items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <span className="flex-1">
            Prefer the classic popup?{' '}
            <button type="button" className="font-bold text-primary underline" onClick={() => void chooseToolbar('popup')}>
              Switch back
            </button>
          </span>
          <button type="button" aria-label="Dismiss" className="grid size-6 place-items-center rounded-md text-muted hover:text-fg" onClick={() => setBannerDismissed(true)}>
            <X size={14} aria-hidden />
          </button>
        </p>
      )}

      <div role="tablist" aria-label="Quick actions" className="grid shrink-0 grid-cols-3 rounded-xl bg-surface-2 p-1">
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
            {t.key === 'inbox' && inboxItems.length > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs font-bold text-muted">{inboxItems.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === 'save' && (
          <SaveTabView
            spaces={spaces}
            collections={collections}
            cardsByCollection={cardsByCollection}
            autoClose={settings.autoCloseTabs}
            onAutoClose={(v) => void updateSettings(db, { autoCloseTabs: v })}
            onStatus={setStatus}
          />
        )}
        {tab === 'group' && (
          <GroupTabsView spaces={spaces} collections={collections} cardsByCollection={cardsByCollection} settings={settings} onStatus={setStatus} />
        )}
        {tab === 'inbox' && (
          <InboxView
            spaces={spaces.filter((sp) => sp.kind !== 'inbox')}
            collections={collections.filter((c) => !inboxCollectionIds.has(c.id))}
            cardsByCollection={cardsByCollection}
            items={inboxItems}
            labels={buildLabelsApi(tags, hashtags, cards)}
            onStatus={setStatus}
          />
        )}
      </div>

      {status && (
        <p role="status" className={`shrink-0 text-sm font-medium ${status.tone === 'ok' ? 'text-primary' : 'text-danger'}`}>
          {status.text}
        </p>
      )}

      {surface === 'popup' && (
        <button type="button" className="shrink-0 self-start text-xs font-semibold text-primary underline" onClick={() => void chooseToolbar('side')}>
          Open the toolbar button in the side panel instead
        </button>
      )}
    </div>
  );
}
