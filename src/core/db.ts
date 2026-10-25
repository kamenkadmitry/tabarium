import Dexie, { type EntityTable } from 'dexie';
import { dayKey } from './activity';
import type { Activity, Card, Collection, Hashtag, SessionSnapshot, Space, Tag } from './types';

export interface SettingRow {
  key: string;
  value: unknown;
}

export class TabariumDB extends Dexie {
  spaces!: EntityTable<Space, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  hashtags!: EntityTable<Hashtag, 'id'>;
  activity!: EntityTable<Activity, 'id'>;
  snapshots!: EntityTable<SessionSnapshot, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'tabarium') {
    super(name);
    this.version(1).stores({
      spaces: 'id, position',
      collections: 'id, spaceId, position',
      cards: 'id, collectionId, url, starred, position',
      tags: 'id, position',
      settings: 'key',
    });
    // v2: multi-entry index so collections can be looked up by tag.
    this.version(2).stores({ collections: 'id, spaceId, position, *tagIds' });
    // v3: tags and #hashtags on cards, and the hashtag table.
    this.version(3)
      .stores({
        cards: 'id, collectionId, url, starred, position, *tagIds, *hashtagIds',
        hashtags: 'id, &name',
      })
      .upgrade((tx) =>
        tx
          .table('cards')
          .toCollection()
          .modify((card: { tagIds?: string[]; hashtagIds?: string[] }) => {
            card.tagIds ??= [];
            card.hashtagIds ??= [];
          }),
      );
    // v4: spaces can have an icon; older spaces get none.
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('spaces')
          .toCollection()
          .modify((space: { icon?: string | null }) => {
            space.icon ??= null;
          }),
      );
    // v5: daily counters for the dashboard. The history starts from the links that exist now.
    this.version(5)
      .stores({ activity: 'id, day, type' })
      .upgrade(async (tx) => {
        const perDay = new Map<string, number>();
        await tx.table('cards').each((card: { createdAt: number }) => {
          const day = dayKey(card.createdAt);
          perDay.set(day, (perDay.get(day) ?? 0) + 1);
        });
        const rows: Activity[] = [...perDay].map(([day, count]) => ({ id: `${day}|added`, day, type: 'added', count }));
        if (rows.length > 0) await tx.table('activity').bulkAdd(rows);
      });
    // v6: the retired Next queue is dropped for good. Null means "delete this table".
    this.version(6).stores({ nexts: null });
    // v7: periodic snapshots of open windows for crash/accidental-close recovery.
    this.version(7).stores({ snapshots: 'id, createdAt' });
  }
}
