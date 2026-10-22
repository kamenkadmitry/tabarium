import { suggestCollectionNames } from '../core/ai/tasks';
import { repo } from '../core/instance';
import { parseDraggedLinks } from './dnd';
import type { Settings } from '../core/settings';
import type { Card, Collection } from '../core/types';
import type { Platform } from '../platform/ports';
import { withProviderAccess } from './ai';
import type { CardRowActions } from './CardRow';
import type { ProposedDetails } from './dialogs/AiDetailsDialog';
import type { DuplicateGuard } from './DuplicateGuard';
import { proposeDetails } from './suggestDetails';
import type { CollectionActions } from './CollectionCard';
import type { Deletion } from '../core/undo';
import type { Runner, TabTarget } from './useOpenTabsController';

export type CollectionDialog =
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'tags'; collectionId?: string }
  | { kind: 'ai-names'; collectionId: string; suggestions: string[] }
  | { kind: 'ai-details'; title: string; items: ProposedDetails[]; skipped: number };

interface Deps {
  platform: Platform;
  settings: Settings | undefined;
  run: Runner;
  aiReady: boolean;
  cardActions: (card: Card) => CardRowActions;
  setDialog: (dialog: CollectionDialog) => void;
  /** Opens the "add link" editor at the end of the collection. */
  openAddLink: (collectionId: string) => void;
  addTabs: (tabIds: readonly number[], target: TabTarget) => Promise<void>;
  guard: DuplicateGuard;
  /** Hands a delete's snapshot to the undo toast. */
  onDeleted: (deletion: Deletion) => void;
}

/** Builds the per-collection action set used by every board layout. */
export function createCollectionActions(deps: Deps): (collection: Collection, cards: readonly Card[]) => CollectionActions {
  const act = (what: string, action: () => Promise<void>) => () => void deps.run(what, action);
  const ai = deps.aiReady && deps.settings ? deps.settings.ai : undefined;
  const groupOptions = (col: Collection) => (deps.settings?.tabGroups ? { groupTitle: col.title } : undefined);

  return (col: Collection, list: readonly Card[]): CollectionActions => ({
    toggleExpanded: act('Updating collection', () => repo.updateCollection(col.id, { expanded: !col.expanded })),
    addLink: () => deps.openAddLink(col.id),
    openAll: act('Opening tabs', () =>
      deps.platform.tabs.openUrls(
        list.map((c) => c.url),
        groupOptions(col),
      ),
    ),
    suggestName: ai
      ? () =>
          void deps.run('Suggesting names', async () => {
            const suggestions = await withProviderAccess(deps.platform, ai, () =>
              suggestCollectionNames(
                ai,
                list.map((c) => ({ title: c.customTitle ?? c.title, url: c.url })),
              ),
            );
            deps.setDialog({ kind: 'ai-names', collectionId: col.id, suggestions });
          })
      : undefined,
    suggestDetails: ai
      ? () =>
          void deps.run('Suggesting details', async () => {
            const unlabeled = list.filter((c) => c.tagIds.length === 0 && c.hashtagIds.length === 0);
            if (unlabeled.length === 0) throw new Error('Every link in this collection already has tags or hashtags.');
            const { items, skipped } = await proposeDetails(deps.platform, ai, unlabeled);
            deps.setDialog({ kind: 'ai-details', title: `Suggested details for “${col.title}”`, items, skipped });
          })
      : undefined,
    replaceWindow: () => {
      if (!confirm(`Close the other tabs in this window and open “${col.title}” instead?`)) return;
      void deps.run('Replacing window tabs', async () => {
        if (!(await deps.platform.permissions.request('tabs'))) {
          throw new Error('Tabarium needs the "tabs" permission to replace the tabs of this window.');
        }
        await deps.platform.tabs.replaceWindowTabs(
          list.map((c) => c.url),
          groupOptions(col),
        );
      });
    },
    rename: () => deps.setDialog({ kind: 'rename-collection', id: col.id, title: col.title }),
    remove: () => void deps.run('Deleting collection', async () => deps.onDeleted(await repo.deleteCollection(col.id))),
    editTags: () => deps.setDialog({ kind: 'tags', collectionId: col.id }),
    setColor: (color) => void deps.run('Setting colour', () => repo.updateCollection(col.id, { color })),
    card: deps.cardActions,
    dropCard: (cardId, before) => void deps.run('Moving tab', () => repo.moveCard(cardId, col.id, before)),
    dropTabs: (tabIds, before) => void deps.addTabs(tabIds, { kind: 'collection', collectionId: col.id, before }),
    dropLinks: (raw, before) =>
      void deps.run('Adding the dropped links', async () => {
        const links = await deps.guard(parseDraggedLinks(raw));
        if (links && links.length > 0) await repo.addCardsBefore(col.id, links, before);
      }),
    dropCollection: (id) => void deps.run('Moving collection', () => repo.moveCollection(id, col.spaceId, col.id)),
  });
}
