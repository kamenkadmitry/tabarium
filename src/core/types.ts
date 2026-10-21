import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const id = z.string().min(1);
const timestamp = z.number().int().nonnegative();

export const SpaceSchema = z.object({
  id,
  name: z.string().min(1),
  /** Key of a picked icon ("lucide:cloud", "brand:github"); null shows the first letter of the name. */
  icon: z.string().max(60).nullable().default(null),
  /** "inbox" is the one system space: it cannot be renamed, edited or deleted. Everything else is "user". */
  kind: z.enum(['user', 'inbox']).default('user'),
  position: z.number(),
  createdAt: timestamp,
});

export const CollectionSchema = z.object({
  id,
  spaceId: id,
  title: z.string(),
  color: z.string().nullable(),
  expanded: z.boolean(),
  tagIds: z.array(id),
  position: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const CardSchema = z.object({
  id,
  collectionId: id,
  title: z.string(),
  url: z.string().url(),
  favIconUrl: z.string().nullable(),
  customTitle: z.string().nullable(),
  note: z.string().nullable(),
  starred: z.boolean(),
  /** Coloured tags (the same tags collections use). */
  tagIds: z.array(id).default([]),
  /** Free-form #hashtags. */
  hashtagIds: z.array(id).default([]),
  position: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const TagSchema = z.object({
  id,
  title: z.string().min(1),
  color: z.string(),
  position: z.number(),
});

export const HashtagSchema = z.object({
  id,
  /** Lowercase, without the leading "#". */
  name: z.string().min(1).max(40),
  createdAt: timestamp,
});

export const NextItemSchema = z.object({
  id,
  cardId: id,
  state: z.enum(['todo', 'done']),
  position: z.number(),
});

export type Space = z.infer<typeof SpaceSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type Hashtag = z.infer<typeof HashtagSchema>;
export type NextItem = z.infer<typeof NextItemSchema>;
