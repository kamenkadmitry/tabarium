import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { proposeTabGroups } from '../../core/ai/tasks';
import { db, repo } from '../../core/instance';
import { applyGroups } from '../../core/organise';
import { setQuickTarget } from '../../core/quicksave';
import type { Settings } from '../../core/settings';
import type { Card, Collection, Space } from '../../core/types';
import { usePlatform } from '../../platform/context';
import { type OpenTab, TAB_GROUP_COLORS } from '../../platform/ports';
import { PageFavicon } from '../CardRow';
import { GROUP_COLORS } from '../openTabsModel';
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

type Mode = 'idle' | 'save' | 'proposal' | 'collections';

/** One group the AI proposed. The title can be edited and the group switched off before anything happens. */
interface ProposedGroup {
  id: number;
  title: string;
  tabs: OpenTab[];
  include: boolean;
}

const colorOf = (index: number) => GROUP_COLORS[TAB_GROUP_COLORS[index % TAB_GROUP_COLORS.length] ?? 'grey'] ?? GROUP_COLORS.grey;

/**
 * Two things to do with the open tabs: save the ticked ones to a collection, or let the AI propose how to group them by
 * meaning and apply that as browser tab groups (or save the groups as collections).
 */
export function GroupTabsView({ spaces, collections, cardsByCollection, settings, onStatus }: Props) {
  const platform = usePlatform();
  const { access, groupsAccess, windows, error, grant, grantGroups } = useOpenTabs(true);
  // Nothing is selected until the user picks tabs (or ticks "Select all").
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [mode, setMode] = useState<Mode>('idle');
  const [proposal, setProposal] = useState<ProposedGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const aiReady = isAiConfigured(settings.ai);

  const fail = (what: string, e: unknown) => {
    console.error(`Tabarium: ${what} failed`, e);
    onStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
  };

  const allTabs = windows.flatMap((w) => w.tabs);
  const chosen = allTabs.filter((t) => selected.has(t.id));
  const allSelected = allTabs.length > 0 && chosen.length === allTabs.length;
  // With nothing ticked the AI works on the tabs of the window you are in.
  const aiScope = chosen.length > 0 ? chosen : (windows.find((w) => w.current)?.tabs ?? allTabs);
  const toCard = (t: OpenTab) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl });
  const included = proposal.filter((g) => g.include && g.title.trim() !== '' && g.tabs.length > 0);

  const saveTogether = async (dest: Destination) => {
    setBusy(true);
    try {
      const id = dest.kind === 'collection' ? dest.collectionId : (await repo.createCollection(dest.spaceId, dest.title)).id;
      const added = await repo.addCards(id, chosen.map(toCard));
      await setQuickTarget(db, id);
      if (settings.autoCloseTabs) await platform.tabs.closeTabs(chosen.map((t) => t.id));
      onStatus({ tone: 'ok', text: `Saved ${added.length} of ${chosen.length} tabs to ${dest.label}.` });
      setMode('idle');
    } catch (e) {
      fail('Saving the tabs', e);
    } finally {
      setBusy(false);
    }
  };

  /** Asks the AI how the tabs belong together. Runs straight from the click so the permission prompt can show. */
  const propose = async () => {
    setBusy(true);
    onStatus(null);
    try {
      const groups = await withProviderAccess(platform, settings.ai, () =>
        proposeTabGroups(
          settings.ai,
          aiScope.map((t) => ({ title: t.title, url: t.url })),
        ),
      );
      setProposal(groups.map((g, id) => ({ id, title: g.title, tabs: g.indexes.map((i) => aiScope[i] as OpenTab), include: true })));
      setMode('proposal');
    } catch (e) {
      fail('Organising with AI', e);
    } finally {
      setBusy(false);
    }
  };

  /** Turns the proposal into real browser tab groups. Runs straight from the click (permission prompt). */
  const groupInBrowser = async () => {
    setBusy(true);
    try {
      if (!(await platform.permissions.request('tabGroups'))) {
        throw new Error('Tabarium needs the "tabGroups" permission to create browser tab groups.');
      }
      for (const [i, g] of included.entries()) {
        await platform.tabs.groupTabs(
          g.tabs.map((t) => t.id),
          g.title.trim(),
          TAB_GROUP_COLORS[i % TAB_GROUP_COLORS.length],
        );
      }
      const count = included.reduce((n, g) => n + g.tabs.length, 0);
      onStatus({ tone: 'ok', text: `Grouped ${count} tabs into ${included.length} browser tab groups.` });
      setMode('idle');
      setProposal([]);
      setSelected(new Set());
    } catch (e) {
      fail('Grouping the tabs', e);
    } finally {
      setBusy(false);
    }
  };

  const saveGroupsAsCollections = async (dest: Destination) => {
    setBusy(true);
    try {
      if (dest.kind !== 'new') throw new Error('Pick a space for the new collections.');
      await applyGroups(
        db,
        repo,
        dest.spaceId,
        included.map((g) => ({ title: g.title.trim(), cards: g.tabs.map(toCard) })),
      );
      if (settings.autoCloseTabs) await platform.tabs.closeTabs(included.flatMap((g) => g.tabs.map((t) => t.id)));
      onStatus({ tone: 'ok', text: `Saved ${included.length} groups as collections in ${dest.label}.` });
      setMode('idle');
      setProposal([]);
    } catch (e) {
      fail('Saving the groups', e);
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

  if (mode === 'proposal' || mode === 'collections') {
    return (
      <div className={`flex min-h-0 flex-1 flex-col gap-3 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <p className="flex shrink-0 items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>{proposal.length} groups proposed by AI</span>
          <button type="button" className="text-primary" onClick={() => setMode(mode === 'collections' ? 'proposal' : 'idle')}>
            {mode === 'collections' ? 'Back' : 'Discard'}
          </button>
        </p>

        {mode === 'proposal' ? (
          <>
            <ul aria-label="Proposed groups" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {proposal.map((g, i) => (
                <li key={g.id} className={`rounded-xl border border-line p-3 ${g.include ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={g.include}
                      aria-label={`Include group ${g.title}`}
                      onChange={() => setProposal((prev) => prev.map((x) => (x.id === g.id ? { ...x, include: !x.include } : x)))}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: colorOf(i) }} />
                    <input
                      aria-label={`Name of group ${i + 1}`}
                      value={g.title}
                      onChange={(e) => setProposal((prev) => prev.map((x) => (x.id === g.id ? { ...x, title: e.target.value } : x)))}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-bold hover:border-line focus:border-primary"
                    />
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{g.tabs.length}</span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1 pl-6">
                    {g.tabs.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-xs">
                        <PageFavicon url={t.url} favIconUrl={t.favIconUrl} size={14} />
                        <span className="min-w-0 flex-1 truncate">{t.title || t.url}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                disabled={included.length === 0}
                onClick={() => void groupInBrowser()}
                className="h-11 rounded-lg bg-accent text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
              >
                Group in the browser ({included.length})
              </button>
              <button
                type="button"
                disabled={included.length === 0}
                onClick={() => setMode('collections')}
                className="h-10 rounded-lg border border-line text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
              >
                Save as collections…
              </button>
            </div>
          </>
        ) : (
          <section aria-label="Choose a space for the new collections" className="min-h-0 flex-1 overflow-y-auto">
            <DestinationPicker spaces={spaces} collections={collections} cardsByCollection={cardsByCollection} query="" pickSpace onPick={(d) => void saveGroupsAsCollections(d)} />
          </section>
        )}
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
      <div aria-label="Open tabs" className="min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsByWindow
          windows={windows}
          selected={selected}
          size="roomy"
          dragAsLinks
          onToggle={(id) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
        {windows.every((w) => w.tabs.length === 0) && <p className="p-4 text-center text-sm text-muted">No web pages are open.</p>}
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
              disabled={aiScope.length < 2}
              onClick={() => void propose()}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden /> Organise with AI
              <span className="text-xs font-normal text-muted">{chosen.length > 0 ? `${chosen.length} selected` : `all ${aiScope.length} here`}</span>
            </button>
          )}
        </div>
      ) : (
        <section aria-label="Choose a collection" className="max-h-[55%] shrink-0 overflow-y-auto">
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span>Save to</span>
            <button type="button" className="text-primary" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </p>
          <DestinationPicker spaces={spaces} collections={collections} cardsByCollection={cardsByCollection} query="" onPick={(d) => void saveTogether(d)} />
        </section>
      )}
    </div>
  );
}
