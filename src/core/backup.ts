import { z } from 'zod';
import type { TabariumDB } from './db';
import {
  CardSchema,
  CollectionSchema,
  HashtagSchema,
  NextItemSchema,
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
  nexts: z.array(NextItemSchema),
});

export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(db: TabariumDB): Promise<Backup> {
  const [spaces, collections, cards, tags, hashtags, nexts] = await Promise.all([
    db.spaces.toArray(),
    db.collections.toArray(),
    db.cards.toArray(),
    db.tags.toArray(),
    db.hashtags.toArray(),
    db.nexts.toArray(),
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
    nexts,
  };
}

/** Parses and fully validates a backup. Throws on malformed input or a newer schema; never partially accepts. */
export function parseBackup(json: string): Backup {
  const backup = BackupSchema.parse(JSON.parse(json));
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Backup schema v${backup.schemaVersion} is newer than supported v${SCHEMA_VERSION}; update the extension`,
    );
  }
  assertReferentialIntegrity(backup);
  return backup;
}

function assertReferentialIntegrity(b: Backup): void {
  const spaces = new Set(b.spaces.map((s) => s.id));
  const collections = new Set(b.collections.map((c) => c.id));
  const cards = new Set(b.cards.map((c) => c.id));
  const tags = new Set(b.tags.map((t) => t.id));
  const hashtags = new Set(b.hashtags.map((h) => h.id));
  for (const c of b.collections) {
    if (!spaces.has(c.spaceId)) throw new Error(`Collection ${c.id} references missing space ${c.spaceId}`);
    for (const t of c.tagIds) {
      if (!tags.has(t)) throw new Error(`Collection ${c.id} references missing tag ${t}`);
    }
  }
  for (const c of b.cards) {
    if (!collections.has(c.collectionId)) {
      throw new Error(`Card ${c.id} references missing collection ${c.collectionId}`);
    }
    for (const t of c.tagIds) if (!tags.has(t)) throw new Error(`Card ${c.id} references missing tag ${t}`);
    for (const h of c.hashtagIds) if (!hashtags.has(h)) throw new Error(`Card ${c.id} references missing hashtag ${h}`);
  }
  for (const n of b.nexts) {
    if (!cards.has(n.cardId)) throw new Error(`Next item ${n.id} references missing card ${n.cardId}`);
  }
}

/** Replaces ALL data with the backup contents in a single transaction (all-or-nothing). */
export async function restoreBackup(db: TabariumDB, backup: Backup): Promise<void> {
  await db.transaction('rw', [db.spaces, db.collections, db.cards, db.tags, db.hashtags, db.nexts], async () => {
    await Promise.all([
      db.spaces.clear(),
      db.collections.clear(),
      db.cards.clear(),
      db.tags.clear(),
      db.hashtags.clear(),
      db.nexts.clear(),
    ]);
    await db.spaces.bulkAdd(backup.spaces);
    await db.collections.bulkAdd(backup.collections);
    await db.cards.bulkAdd(backup.cards);
    await db.tags.bulkAdd(backup.tags);
    await db.hashtags.bulkAdd(backup.hashtags);
    await db.nexts.bulkAdd(backup.nexts);
  });
}
