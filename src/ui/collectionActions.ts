import { suggestCollectionNames } from '../core/ai/tasks';
import { repo } from '../core/instance';
import type { Settings } from '../core/settings';
import type { Card, Collection } from '../core/types';
import type { Platform } from '../platform/ports';
import { withProviderAccess } from './ai';
import type { CardRowActions } from './CardRow';
import type { CollectionActions } from './CollectionCard';
import type { Runner, TabTarget } from './useOpenTabsController';

export type CollectionDialog =
  | { kind: 'link'; collectionId: string; title: string }
  | { kind: 'rename-collection'; id: string; title: string }
  | { kind: 'tags'; collectionId?: string }
  | { kind: 'ai-names'; collectionId: string; suggestions: string[] };

interface Deps {
  platform: Platform;
  settings: Settings | undefined;
  run: Runner;
  aiReady: boolean;
  cardActions: (card: Card) => CardRowActions;
  setDialog: (dialog: CollectionDialog) => void;
  addTabs: (tabIds: readonly number[], target: TabTarget) => Promise<void>;
}

/** Builds the per-collection action set used by every board layout. */
export function createCollectionActions(deps: Deps): (collection: Collection, cards: readonly Card[]) => CollectionActions {
  const act = (what: string, action: () => Promise<void>) => () => void deps.run(what, action);
  const ai = deps.aiReady && deps.settings ? deps.settings.ai : undefined;
  const groupOptions = (col: Collection) => (deps.settings?.tabGroups ? { groupTitle: col.title } : undefined);

  return (col: Collection, list: readonly Card[]): CollectionActions => ({
    toggleExpanded: act('Updating collection', () => repo.updateCollection(col.id, { expanded: !col.expanded })),
    addLink: () => deps.setDialog({ kind: 'link', collectionId: col.id, title: col.title }),
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
    remove: () => {
      if (confirm(`Delete “${col.title}” and its ${list.length} tabs?`)) {
        void deps.run('Deleting collection', () => repo.deleteCollection(col.id));
      }
    },
    editTags: () => deps.setDialog({ kind: 'tags', collectionId: col.id }),
    setColor: (color) => void deps.run('Setting colour', () => repo.updateCollection(col.id, { color })),
    addAllToNext: act('Adding to Next', async () => {
      for (const c of list) await repo.addToNext(c.id);
    }),
    card: deps.cardActions,
    dropCard: (cardId, before) => void deps.run('Moving tab', () => repo.moveCard(cardId, col.id, before)),
    dropTabs: (tabIds, before) => void deps.addTabs(tabIds, { kind: 'collection', collectionId: col.id, before }),
    dropCollection: (id) => void deps.run('Moving collection', () => repo.moveCollection(id, col.spaceId, col.id)),
  });
}
