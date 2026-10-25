import { z } from 'zod';

export const SCHEMA_VERSION = 2;

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
  /** The page's own description (meta description) and first heading, read when the user allows it. */
  description: z.string().nullable().default(null),
  heading: z.string().nullable().default(null),
  /** When the page was last read for the two fields above; null when it never was. */
  pageInfoAt: timestamp.nullable().default(null),
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

/** Things the dashboard counts over time. */
export const ACTIVITY_TYPES = ['added', 'deleted', 'duplicates-removed', 'duplicates-skipped', 'duplicates-created'] as const;

/** How many times something happened on one local day. The history is kept as these daily counters. */
export const ActivitySchema = z.object({
  /** `${day}|${type}` */
  id: z.string().min(1),
  /** Local calendar day, YYYY-MM-DD. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(ACTIVITY_TYPES),
  count: z.number().int().positive(),
});

export type Space = z.infer<typeof SpaceSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type Hashtag = z.infer<typeof HashtagSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** One saveable tab of a snapshot window; groupId points at the window's remembered groups. */
export interface SnapshotTab {
  title: string;
  url: string;
  favIconUrl: string | null;
  groupId?: number;
}

/** A browser window's contents when the snapshot ran. */
export interface SnapshotWindow {
  tabs: SnapshotTab[];
  /** Tab groups as they were then; restoring only borrows their titles and colours. */
  groups: { id: number; title: string; color: string }[];
}

/** The set of open windows stored by the periodic session-snapshot alarm. */
export interface SessionSnapshot {
  id: string;
  createdAt: number;
  windows: SnapshotWindow[];
}
