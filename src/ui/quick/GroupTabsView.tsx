import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { groupTabs } from '../../core/ai/tasks';
import { db, repo } from '../../core/instance';
import { applyGroups, loadLibraryContext } from '../../core/organise';
import { setQuickTarget } from '../../core/quicksave';
import type { Settings } from '../../core/settings';
import type { Card, Collection, Space } from '../../core/types';
import { usePlatform } from '../../platform/context';
import type { OpenTab } from '../../platform/ports';
import { TabsByWindow } from '../TabsByWindow';
import { useOpenTabs } from '../useOpenTabs';
import { isAiConfigured, withProviderAccess } from '../ai';
import { type Destination, DestinationPicker } from './DestinationPicker';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, readonly Card[]>;
  settings: Settings;
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

type Mode = 'idle' | 'save' | 'ai';

/** Saves the tabs of this window together: into one collection, or split into topic collections by AI. */
export function GroupTabsView({ spaces, collections, cardsByCollection, settings, onStatus }: Props) {
  const platform = usePlatform();
  const { access, groupsAccess, windows, error, grant, grantGroups } = useOpenTabs(true);
  // Nothing is selected until the user picks tabs (or ticks "Select all").
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const aiReady = isAiConfigured(settings.ai);

  const fail = (what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    onStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
  };

  const allTabs = windows.flatMap((w) => w.tabs);
  const chosen = allTabs.filter((t) => selected.has(t.id));
  const allSelected = allTabs.length > 0 && chosen.length === allTabs.length;
  const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });

  const finish = async (message: string) => {
    if (settings.autoCloseTabs) await platform.tabs.closeTabs(chosen.map((t) => t.id));
    onStatus({ tone: 'ok', text: message });
    setMode('idle');
  };

  const saveTogether = async (dest: Destination) => {
    setBusy(true);
    try {
      const id = dest.kind === 'collection' ? dest.collectionId : (await repo.createCollection(dest.spaceId, dest.title)).id;
      const added = await repo.addCards(id, chosen.map(toCard));
      await setQuickTarget(db, id);
      await finish(`Saved ${added.length} of ${chosen.length} tabs to ${dest.label}.`);
    } catch (e) {
      fail('Saving the tabs', e);
    } finally {
      setBusy(false);
    }
  };

  const organise = async (dest: Destination) => {
    setBusy(true);
    try {
      if (dest.kind !== 'new') throw new Error('Pick a space for the new collections.');
      const groups = await withProviderAccess(platform, settings.ai, async () =>
        groupTabs(
          settings.ai,
          chosen.map((t) => ({ title: t.title, url: t.url })),
          undefined,
          await loadLibraryContext(db, dest.spaceId),
        ),
      );
      await applyGroups(
        db,
        repo,
        dest.spaceId,
        groups.map((g) => ({ title: g.title, cards: g.indexes.map((i) => toCard(chosen[i] as OpenTab)), tags: g.tags, hashtags: g.hashtags })),
      );
      await finish(`Organised ${chosen.length} tabs into ${groups.length} collections in ${dest.label}.`);
    } catch (e) {
      fail('Organising with AI', e);
    } finally {
      setBusy(false);
    }
  };

  if (access !== 'granted') {
    return (
      <div className="px-2 py-6 text-center">
        <p className="text-sm text-muted">{access === 'checking' ? 'Reading your tabs…' : 'Save all the tabs of a window at once.'}</p>
        {access === 'needed' && (
          <button
            type="button"
            onClick={() => void grant()}
            className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
          >
            Allow Tabarium to see your open tabs
          </button>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={allTabs.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(allTabs.map((t) => t.id)))}
            className="size-4 accent-[var(--primary)]"
          />
          Select all
        </label>
        {!groupsAccess && (
          <button type="button" onClick={() => void grantGroups()} className="text-xs font-semibold text-primary underline">
            Show browser tab groups
          </button>
        )}
      </div>
      <div aria-label="Tabs to save" className="min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsByWindow
          windows={windows}
          selected={selected}
          size="roomy"
          onToggle={(id) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
        {chosen.length === 0 && windows.every((w) => w.tabs.length === 0) && (
          <p className="p-4 text-center text-sm text-muted">No web pages are open.</p>
        )}
      </div>

      {mode === 'idle' ? (
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => setMode('save')}
            className="h-11 rounded-lg bg-accent text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          >
            Save {chosen.length} tab{chosen.length === 1 ? '' : 's'} to a collection
          </button>
          {aiReady && (
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => setMode('ai')}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden /> Organise with AI
            </button>
          )}
        </div>
      ) : (
        <section aria-label={mode === 'save' ? 'Choose a collection' : 'Choose a space for the new collections'} className="max-h-[55%] shrink-0 overflow-y-auto">
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span>{mode === 'save' ? 'Save to' : 'Create collections in'}</span>
            <button type="button" className="text-primary" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </p>
          <DestinationPicker
            spaces={spaces}
            collections={collections}
            cardsByCollection={cardsByCollection}
            query=""
            pickSpace={mode === 'ai'}
            onPick={(d) => void (mode === 'save' ? saveTogether(d) : organise(d))}
          />
        </section>
      )}
    </div>
  );
}
