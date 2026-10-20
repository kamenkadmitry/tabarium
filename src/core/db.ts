import Dexie, { type EntityTable } from 'dexie';
import type { Card, Collection, NextItem, Space, Tag } from './types';

export interface SettingRow {
  key: string;
  value: unknown;
}

export class TabariumDB extends Dexie {
  spaces!: EntityTable<Space, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  nexts!: EntityTable<NextItem, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'tabarium') {
    super(name);
    this.version(1).stores({
      spaces: 'id, position',
      collections: 'id, spaceId, position',
      cards: 'id, collectionId, url, starred, position',
      tags: 'id, position',
      nexts: 'id, cardId, position',
      settings: 'key',
    });
  }
}
