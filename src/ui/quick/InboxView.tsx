import { FolderInput, Inbox, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db, repo } from '../../core/instance';
import { saveToInbox } from '../../core/quicksave';
import type { Card, Collection, Space } from '../../core/types';
import { normalizeUrl } from '../../core/url';
import { usePlatform } from '../../platform/context';
import { hostOf, PageFavicon } from '../CardRow';
import { linkDragProps } from '../dnd';
import { useActiveTab } from './useActiveTab';
import { type Destination, DestinationPicker } from './DestinationPicker';

interface Props {
  spaces: readonly Space[];
  /** Every collection except the Inbox itself: where a link can be moved to. */
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, readonly Card[]>;
  /** What is in the Inbox now, newest first. */
  items: readonly Card[];
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

/**
 * Links saved here wait to be sorted. Moving one to a collection or removing it takes it out of the list, so the list
 * only shows what still needs attention.
 */
export function InboxView({ spaces, collections, cardsByCollection, items, onStatus }: Props) {
  const platform = usePlatform();
  const { hasAccess, allow } = useActiveTab();
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<Card | null>(null);

  const run = async (what: string, action: () => Promise<string>) => {
    setBusy(true);
    onStatus(null);
    try {
      onStatus({ tone: 'ok', text: await action() });
    } catch (e) {
      console.error(`Tabarium: ${what} failed`, e);
      onStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const addCurrent = () =>
    run('Adding to Inbox', async () => {
      // Without the "tabs" permission the address of the current tab is hidden; ask first (this runs from a click).
      if (!hasAccess && !(await allow())) throw new Error('Tabarium needs the "tabs" permission to see which page you are on.');
      const tab = await platform.tabs.getActiveTab();
      if (!tab) throw new Error('This page cannot be saved (only http and https pages can).');
      const added = await saveToInbox(db, [{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      return added > 0 ? 'Added to Inbox.' : 'Already in Inbox.';
    });

  const moveTo = (card: Card, dest: Destination) =>
    run('Moving the link', async () => {
      const targetId = dest.kind === 'collection' ? dest.collectionId : (await repo.createCollection(dest.spaceId, dest.title)).id;
      const key = normalizeUrl(card.url);
      const already = (cardsByCollection.get(targetId) ?? []).some((c) => normalizeUrl(c.url) === key);
      if (already) {
        // The link is already there: only take it out of the Inbox instead of creating a second copy.
        await repo.deleteCard(card.id);
        setMoving(null);
        return `Already in ${dest.label}. Removed from Inbox.`;
      }
      await repo.moveCard(card.id, targetId);
      setMoving(null);
      return `Moved to ${dest.label}.`;
    });

  const remove = (card: Card) => {
    if (!confirm(`Remove “${card.customTitle ?? card.title}” from Inbox? The link is deleted from the library.`)) return;
    void run('Removing the link', async () => {
      await repo.deleteCard(card.id);
      return 'Removed from Inbox.';
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void addCurrent()}
        className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
      >
        <Inbox size={16} aria-hidden /> Add this tab to Inbox
      </button>

      {moving ? (
        <section aria-label={`Move ${moving.customTitle ?? moving.title}`} className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="truncate">Move “{moving.customTitle ?? moving.title}” to</span>
            <button type="button" className="shrink-0 text-primary" onClick={() => setMoving(null)}>
              Cancel
            </button>
          </p>
          <DestinationPicker spaces={spaces} collections={collections} cardsByCollection={cardsByCollection} query="" onPick={(d) => void moveTo(moving, d)} />
        </section>
      ) : (
        <ul aria-label="Inbox" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((card) => {
            const title = card.customTitle ?? card.title;
            return (
              <li
                key={card.id}
                {...linkDragProps([{ title, url: card.url, favIconUrl: card.favIconUrl }])}
                className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-1 hover:bg-surface-2"
              >
                <PageFavicon url={card.url} favIconUrl={card.favIconUrl} size={20} />
                <a href={card.url} target="_blank" rel="noreferrer" draggable={false} className="min-w-0 flex-1 py-1">
                  <span className="block truncate text-sm font-medium">{title}</span>
                  <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Move ${title} out of Inbox`}
                  disabled={busy}
                  onClick={() => setMoving(card)}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-bg hover:text-primary"
                >
                  <FolderInput size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${title} from Inbox`}
                  disabled={busy}
                  onClick={() => remove(card)}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-bg hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            );
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Inbox is empty. Tabs you add here wait until you sort them into a collection.</li>}
        </ul>
      )}
    </div>
  );
}
