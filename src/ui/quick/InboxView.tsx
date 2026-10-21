import { FolderInput, Inbox, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db, repo } from '../../core/instance';
import { saveToInbox } from '../../core/quicksave';
import type { Card, Collection, Space } from '../../core/types';
import { normalizeUrl } from '../../core/url';
import { usePlatform } from '../../platform/context';
import { hostOf, PageFavicon } from '../CardRow';
import { useDuplicateGuard } from '../DuplicateGuard';
import { linkDragProps } from '../dnd';
import type { LabelsApi } from '../labels';
import { LinkEditor } from '../LinkEditor';
import { cardPatch } from '../linkInput';
import { useActiveTab } from './useActiveTab';
import { type Destination, DestinationPicker } from './DestinationPicker';

interface Props {
  /** Spaces a link can be moved to: every space except the Inbox. */
  spaces: readonly Space[];
  /** Collections a link can be moved to: every collection outside the Inbox. */
  collections: readonly Collection[];
  cardsByCollection: ReadonlyMap<string, readonly Card[]>;
  /** What is in the Inbox now, newest first. */
  items: readonly Card[];
  labels: LabelsApi;
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

/**
 * The Inbox space, seen as a plain list. It is the same data the library shows for the Inbox space, so what you change
 * here changes there at once, and the other way round. Moving a link out or removing it takes it off the list.
 */
export function InboxView({ spaces, collections, cardsByCollection, items, labels, onStatus }: Props) {
  const platform = usePlatform();
  const guard = useDuplicateGuard();
  const { hasAccess, allow } = useActiveTab();
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<Card | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      const approved = await guard([{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      if (!approved) return 'Not added: the link is already in your library.';
      const added = await saveToInbox(db, approved);
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
              <li key={card.id} className="flex flex-col">
                <div
                  {...linkDragProps([{ title, url: card.url, favIconUrl: card.favIconUrl }])}
                  className={`group flex min-h-12 items-center gap-3 rounded-xl px-2 py-1 hover:bg-surface-2 ${editingId === card.id ? 'bg-surface-2' : ''}`}
                >
                  <PageFavicon url={card.url} favIconUrl={card.favIconUrl} size={20} />
                  <a href={card.url} target="_blank" rel="noreferrer" draggable={false} className="min-w-0 flex-1 py-1">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
                  </a>
                  <button
                    type="button"
                    aria-label={`Edit ${title}`}
                    disabled={busy}
                    onClick={() => setEditingId(editingId === card.id ? null : card.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-bg hover:text-primary"
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
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
                </div>
                {editingId === card.id && (
                  <div className="px-1 pb-2">
                    <LinkEditor
                      key={card.id}
                      mode="edit"
                      layout="stack"
                      labels={labels}
                      initial={{ title, url: card.url, note: card.note ?? '', tagIds: card.tagIds, hashtagIds: card.hashtagIds }}
                      onSubmit={async (values) => {
                        try {
                          await repo.saveCard(card.id, cardPatch(card, values), { tagIds: values.tagIds, hashtagIds: values.hashtagIds });
                          setEditingId(null);
                          return true;
                        } catch (e) {
                          console.error('Tabarium: saving the link failed', e);
                          onStatus({ tone: 'error', text: `Saving the link failed: ${e instanceof Error ? e.message : String(e)}` });
                          return false;
                        }
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Inbox is empty. Tabs you add here wait until you sort them into a collection.</li>}
        </ul>
      )}
    </div>
  );
}
