import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { groupTabs } from '../../core/ai/tasks';
import { db, repo } from '../../core/instance';
import { setQuickTarget } from '../../core/quicksave';
import type { Settings } from '../../core/settings';
import type { Card, Collection, Space } from '../../core/types';
import { usePlatform } from '../../platform/context';
import type { OpenTab } from '../../platform/ports';
import { TabPill } from '../TabPill';
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
  const [tabs, setTabs] = useState<OpenTab[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const aiReady = isAiConfigured(settings.ai);

  const fail = (what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    onStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
  };

  const load = async () => {
    onStatus(null);
    try {
      if (!(await platform.permissions.request('tabs'))) {
        throw new Error('Tabarium needs the "tabs" permission to read the tabs of this window.');
      }
      const list = await platform.tabs.listWindowTabs();
      setTabs(list);
      setSelected(new Set(list.map((t) => t.id)));
    } catch (e) {
      fail('Reading tabs', e);
    }
  };

  const chosen = (tabs ?? []).filter((t) => selected.has(t.id));
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
      const groups = await withProviderAccess(platform, settings.ai, () =>
        groupTabs(
          settings.ai,
          chosen.map((t) => ({ title: t.title, url: t.url })),
        ),
      );
      for (const g of groups) {
        const col = await repo.createCollection(dest.kind === 'new' ? dest.spaceId : '', g.title);
        await repo.addCards(col.id, g.indexes.map((i) => toCard(chosen[i] as OpenTab)));
      }
      await finish(`Organised ${chosen.length} tabs into ${groups.length} collections in ${dest.label}.`);
    } catch (e) {
      fail('Organising with AI', e);
    } finally {
      setBusy(false);
    }
  };

  if (tabs === null) {
    return (
      <div className="px-2 py-6 text-center">
        <p className="text-sm text-muted">Save all the tabs of this window at once.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
        >
          Show tabs of this window
        </button>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <ul aria-label="Tabs of this window" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {tabs.map((t) => (
          <TabPill
            key={t.id}
            tab={t}
            selected={selected.has(t.id)}
            onToggleSelect={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(t.id)) next.delete(t.id);
                else next.add(t.id);
                return next;
              })
            }
          />
        ))}
        {tabs.length === 0 && <li className="p-4 text-center text-sm text-muted">No web pages are open in this window.</li>}
      </ul>

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
