import { Search } from 'lucide-react';
import { useState } from 'react';
import { db, repo } from '../../core/instance';
import { setQuickTarget } from '../../core/quicksave';
import type { Card, Collection, Hashtag, Space, Tag } from '../../core/types';
import { usePlatform } from '../../platform/context';
import { hostOf } from '../CardRow';
import { useDuplicateGuard } from '../DuplicateGuard';
import { linkDragProps } from '../dnd';
import { inputClass } from '../Dialog';
import { type Destination, DestinationPicker } from './DestinationPicker';
import { useActiveTab } from './useActiveTab';
import { useT } from '../../i18n/I18nProvider';

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, readonly Card[]>;
  /** Labels the link search matches on. */
  tags: readonly Tag[];
  hashtags: readonly Hashtag[];
  autoClose: boolean;
  onAutoClose: (value: boolean) => void;
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

/** "Saving this tab" card plus a space/collection picker: choosing a collection saves the tab there. */
export function SaveTabView({ spaces, collections, cardsByCollection, tags, hashtags, autoClose, onAutoClose, onStatus }: Props) {
  const t = useT();
  const platform = usePlatform();
  const guard = useDuplicateGuard();
  const { tab, hasAccess: hasTabsAccess, error: tabError, allow } = useActiveTab();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const allowTabAccess = async () => {
    try {
      if (!(await allow())) onStatus({ tone: 'error', text: t('err.needTabsForFollow') });
    } catch (e) {
      console.error('Tabarium: requesting the tabs permission failed', e);
      onStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const save = async (dest: Destination) => {
    if (!tab) {
      onStatus({ tone: 'error', text: t('err.openWebPage') });
      return;
    }
    setBusy(true);
    onStatus(null);
    try {
      const collectionId =
        dest.kind === 'collection' ? dest.collectionId : (await repo.createCollection(dest.spaceId, dest.title)).id;
      const approved = await guard([{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      if (!approved) {
        onStatus({ tone: 'ok', text: t('save.notSaved') });
        return;
      }
      const added = await repo.addCards(collectionId, approved);
      await setQuickTarget(db, collectionId);
      if (autoClose && added.length > 0) await platform.tabs.closeTabs([tab.id]);
      onStatus({ tone: 'ok', text: added.length > 0 ? t('save.savedTo', { dest: dest.label }) : t('save.alreadyIn', { dest: dest.label }) });
    } catch (e) {
      console.error('Tabarium: saving the tab failed', e);
      onStatus({ tone: 'error', text: t('save.failed', { error: e instanceof Error ? e.message : String(e) }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <label className="relative block shrink-0">
        <span className="sr-only">{t('save.search')}</span>
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('save.search')} className={`${inputClass} pl-9`} />
      </label>

      <section aria-label={t('save.heading')} className="shrink-0">
        <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{t('save.heading')}</p>
        <div
          className="rounded-xl border border-line bg-surface px-3 py-2.5"
          {...(tab ? { ...linkDragProps([{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]), title: t('save.dragHint') } : {})}
        >
          {tab === undefined && <p className="text-sm text-muted">{t('save.reading')}</p>}
          {tab === null && (
            <div className="text-sm text-muted">
              <p>{tabError ?? t('err.notWebPage')}</p>
              {!hasTabsAccess && (
                <button type="button" onClick={() => void allowTabAccess()} className="mt-2 font-semibold text-primary underline">
                  {t('save.allow')}
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

      <div className={`min-h-0 flex-1 overflow-y-auto ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        <DestinationPicker
          spaces={spaces}
          collections={collections}
          cardsByCollection={cardsByCollection}
          currentUrl={tab?.url ?? null}
          query={query}
          tags={tags}
          hashtags={hashtags}
          onOpenLink={(card) => void platform.tabs.openUrl(card.url)}
          onReveal={(c) => void platform.tabs.openLibrary(c.id)}
          onPick={(d) => void save(d)}
        />
      </div>

      <label className="flex min-h-9 shrink-0 items-center gap-2 px-1 text-sm">
        <input type="checkbox" checked={autoClose} onChange={(e) => onAutoClose(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        {t('save.closeAfter')}
      </label>
    </div>
  );
}
