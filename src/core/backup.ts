import { z } from 'zod';
import { tr } from '../i18n/runtime';
import type { TabariumDB } from './db';
import {
  ActivitySchema,
  CardSchema,
  CollectionSchema,
  HashtagSchema,
  SCHEMA_VERSION,
  SpaceSchema,
  TagSchema,
} from './types';

export const BackupSchema = z.object({
  app: z.literal('tabarium'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.number().int(),
  spaces: z.array(SpaceSchema),
  collections: z.array(CollectionSchema),
  cards: z.array(CardSchema),
  tags: z.array(TagSchema),
  hashtags: z.array(HashtagSchema).default([]),
  activity: z.array(ActivitySchema).default([]),
});

export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(db: TabariumDB): Promise<Backup> {
  const [spaces, collections, cards, tags, hashtags, activity] = await Promise.all([
    db.spaces.toArray(),
    db.collections.toArray(),
    db.cards.toArray(),
    db.tags.toArray(),
    db.hashtags.toArray(),
    db.activity.toArray(),
  ]);
  return {
    app: 'tabarium',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    spaces,
    collections,
    cards,
    tags,
    hashtags,
    activity,
  };
}

/** Parses and fully validates a backup. Throws on malformed input or a newer schema; never partially accepts. */
export function parseBackup(json: string): Backup {
  const backup = BackupSchema.parse(JSON.parse(json));
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error(tr()('err.backupTooNew', { version: backup.schemaVersion, supported: SCHEMA_VERSION }));
  }
  assertReferentialIntegrity(backup);
  return backup;
}

function assertReferentialIntegrity(b: Backup): void {
  const spaces = new Set(b.spaces.map((s) => s.id));
  const collections = new Set(b.collections.map((c) => c.id));
  const tags = new Set(b.tags.map((t) => t.id));
  const hashtags = new Set(b.hashtags.map((h) => h.id));
  for (const c of b.collections) {
    if (!spaces.has(c.spaceId)) throw new Error(tr()('err.backupSpaceRef', { id: c.id, spaceId: c.spaceId }));
    for (const t of c.tagIds) {
      if (!tags.has(t)) throw new Error(tr()('err.backupTagRef', { id: c.id, tagId: t }));
    }
  }
  for (const c of b.cards) {
    if (!collections.has(c.collectionId)) {
      throw new Error(tr()('err.backupCardRef', { id: c.id, collectionId: c.collectionId }));
    }
    for (const t of c.tagIds) if (!tags.has(t)) throw new Error(tr()('err.backupCardTagRef', { id: c.id, tagId: t }));
    for (const h of c.hashtagIds) if (!hashtags.has(h)) throw new Error(tr()('err.backupCardHashtagRef', { id: c.id, hashtagId: h }));
  }
}

/** Replaces ALL data with the backup contents in a single transaction (all-or-nothing). */
export async function restoreBackup(db: TabariumDB, backup: Backup): Promise<void> {
  await db.transaction('rw', [db.spaces, db.collections, db.cards, db.tags, db.hashtags, db.activity], async () => {
    await Promise.all([
      db.spaces.clear(),
      db.collections.clear(),
      db.cards.clear(),
      db.tags.clear(),
      db.hashtags.clear(),
      db.activity.clear(),
    ]);
    await db.spaces.bulkAdd(backup.spaces);
    await db.collections.bulkAdd(backup.collections);
    await db.cards.bulkAdd(backup.cards);
    await db.tags.bulkAdd(backup.tags);
    await db.hashtags.bulkAdd(backup.hashtags);
    await db.activity.bulkAdd(backup.activity);
  });
}
