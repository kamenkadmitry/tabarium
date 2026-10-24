import { z } from 'zod';
import { normalizeHashtag } from '../hashtag';
import { tr } from '../../i18n/runtime';
import { AiError, type AiConfig, complete, type FetchLike } from './client';

export interface PageRef {
  title: string;
  url: string;
}

/** Pulls the JSON value out of a model answer that may be wrapped in a code fence or surrounded by prose. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new AiError(tr()('err.aiNoJson'));
  const end = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'));
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AiError(tr()('err.aiBadJson'));
  }
}

const list = (pages: readonly PageRef[]) => pages.map((p, i) => `${i + 1}. ${p.title} — ${p.url}`).join('\n');

const NamesSchema = z.array(z.string().trim().min(1).max(60)).min(1);

/** Suggests short names for a collection holding these pages. */
export async function suggestCollectionNames(config: AiConfig, pages: readonly PageRef[], fetchImpl?: FetchLike): Promise<string[]> {
  if (pages.length === 0) throw new AiError(tr()('err.aiEmptyCollection'));
  const answer = await complete(
    config,
    {
      system: 'You name bookmark collections. Reply with only a JSON array of 3 short names (max 4 words each), no commentary.',
      prompt: `Suggest names for a collection containing:\n${list(pages.slice(0, 40))}`,
      maxTokens: 600,
    },
    fetchImpl,
  );
  const parsed = NamesSchema.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiError(tr()('err.aiNoNames'));
  return [...new Set(parsed.data)].slice(0, 5);
}

export interface TabGroup {
  title: string;
  /** Indexes into the input array. */
  indexes: number[];
  /** Titles of existing tags that fit this group (never invented). */
  tags: string[];
  /** Hashtags for the tabs of this group, without "#": existing ones when they fit, new ones otherwise. */
  hashtags: string[];
}

/** What the library already holds, so the model reuses it instead of inventing near-duplicates. */
export interface LibraryContext {
  collections: readonly string[];
  tags: readonly string[];
  hashtags: readonly string[];
}

const GroupsSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(60),
      tabs: z.array(z.number().int().min(1)).min(1),
      tags: z.array(z.string()).optional(),
      hashtags: z.array(z.string()).optional(),
    }),
  )
  .min(1);

const MAX_LISTED = 100;
const named = (label: string, items: readonly string[]) =>
  `${label}: ${items.length === 0 ? '(none)' : items.slice(0, MAX_LISTED).join(', ')}`;

/**
 * Splits pages into named groups. Every page ends up in exactly one group; unmentioned pages go to "Other".
 * With a `context` the model is told which collections, tags and hashtags exist so it reuses them.
 */
export async function groupTabs(
  config: AiConfig,
  pages: readonly PageRef[],
  fetchImpl?: FetchLike,
  context: LibraryContext = { collections: [], tags: [], hashtags: [] },
): Promise<TabGroup[]> {
  if (pages.length === 0) throw new AiError(tr()('err.aiNoTabs'));
  const answer = await complete(
    config,
    {
      system:
        'You organise browser tabs into topic groups for a personal bookmark library. ' +
        'Reply with only JSON: [{"title":"Group name","tabs":[1,2],"tags":["Existing tag"],"hashtags":["topic"]}]. ' +
        'Rules: use the tab numbers given and put each tab in exactly one group; use 2 to 6 groups; keep names under 4 words. ' +
        'When a group fits an EXISTING collection, use that collection\'s exact title instead of inventing a new one. ' +
        '"tags" may contain only names from the existing tags list, and is empty when none fits; never invent tags. ' +
        '"hashtags" holds 0 to 3 lowercase single-word topics; reuse an existing hashtag when one fits and create a new one only when none does. ' +
        'No commentary.',
      prompt: `${named('Existing collections', context.collections)}\n${named('Existing tags', context.tags)}\n${named('Existing hashtags', context.hashtags)}\n\nGroup these tabs:\n${list(pages.slice(0, 80))}`,
      maxTokens: 2800,
    },
    fetchImpl,
  );
  const parsed = GroupsSchema.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiError(tr()('err.aiNoGroups'));

  const tagByLower = new Map(context.tags.map((t) => [t.toLowerCase(), t]));
  const collectionByLower = new Map(context.collections.map((c) => [c.toLowerCase(), c]));
  const limit = Math.min(pages.length, 80);
  const assigned = new Set<number>();
  const groups: TabGroup[] = [];
  for (const g of parsed.data) {
    const indexes = g.tabs.map((n) => n - 1).filter((i) => i < limit && !assigned.has(i));
    indexes.forEach((i) => assigned.add(i));
    if (indexes.length === 0) continue;
    const tags = [...new Set((g.tags ?? []).flatMap((t) => tagByLower.get(t.trim().toLowerCase()) ?? []))];
    const hashtags = [...new Set((g.hashtags ?? []).map(normalizeHashtag).filter((h) => h !== ''))].slice(0, 3);
    groups.push({ title: collectionByLower.get(g.title.toLowerCase()) ?? g.title, indexes, tags, hashtags });
  }
  const rest = pages.map((_, i) => i).filter((i) => !assigned.has(i));
  if (rest.length > 0) groups.push({ title: tr()('inbox.other'), indexes: rest, tags: [], hashtags: [] });
  return groups;
}

/**
 * Proposes how to group open browser tabs by meaning, to be applied as browser tab groups. Every tab ends up in exactly one
 * group; tabs the model leaves out go to "Other". Unlike `groupTabs` it knows nothing about the library.
 */
export async function proposeTabGroups(config: AiConfig, pages: readonly PageRef[], fetchImpl?: FetchLike): Promise<{ title: string; indexes: number[] }[]> {
  if (pages.length < 2) throw new AiError(tr()('err.aiNeedTwoTabs'));
  const answer = await complete(
    config,
    {
      system:
        'You sort open browser tabs into groups by meaning (topic, project or task) so the user can group them in the browser. ' +
        'Reply with only JSON: [{"title":"Group name","tabs":[1,2]}]. ' +
        'Use the tab numbers given and put each tab in exactly one group. Make 2 to 6 groups, with names of at most 3 words, ' +
        'in the language most of the tab titles use. A tab that fits nowhere goes into a group called "Other". No commentary.',
      prompt: `Group these tabs:\n${list(pages.slice(0, 80))}`,
      maxTokens: 2400,
    },
    fetchImpl,
  );
  const parsed = GroupsSchema.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiError(tr()('err.aiNoGroups'));

  const limit = Math.min(pages.length, 80);
  const assigned = new Set<number>();
  const groups: { title: string; indexes: number[] }[] = [];
  for (const g of parsed.data) {
    const indexes = g.tabs.map((n) => n - 1).filter((i) => i < limit && !assigned.has(i));
    indexes.forEach((i) => assigned.add(i));
    if (indexes.length > 0) groups.push({ title: g.title, indexes });
  }
  const rest = pages.map((_, i) => i).filter((i) => !assigned.has(i));
  if (rest.length > 0) groups.push({ title: tr()('inbox.other'), indexes: rest });
  return groups;
}

/** Where the AI thinks a link belongs. `isNew` means the collection does not exist yet (its space does). */
export interface SuggestedDestination {
  space: string;
  collection: string;
  isNew: boolean;
}

export interface CardDetails {
  /** One short sentence about the page; empty when the model is not sure what the page is. */
  note: string;
  /** At most one tag: an existing one when it fits, otherwise a new one. */
  tags: string[];
  /** Which of `tags` do not exist yet. */
  newTags: string[];
  /** Hashtags without "#": existing ones first, new ones for what they do not cover. */
  hashtags: string[];
  /** Which of `hashtags` do not exist yet. */
  newHashtags: string[];
  destination: SuggestedDestination | null;
}

/** What already exists in the library, so suggestions reuse it before inventing anything. */
export interface LabelContext {
  tags: readonly string[];
  hashtags: readonly string[];
  /** Collections outside the Inbox, with the space each lives in. */
  collections: readonly { space: string; title: string }[];
}

export const MAX_DETAILS_PER_REQUEST = 30;
export const MAX_SUGGESTED_HASHTAGS = 6;
const NOTE_LIMIT = 200;
const NAME_LIMIT = 40;

const DetailsSchema = z
  .array(
    z.object({
      n: z.number().int().min(1),
      note: z.string().optional(),
      tag: z.string().nullish(),
      hashtags: z.array(z.string()).optional(),
      collection: z.string().nullish(),
      newCollection: z.object({ space: z.string(), title: z.string() }).nullish(),
    }),
  )
  .min(1);

/**
 * Proposes a short note, one tag, several hashtags and a collection for links. The model sees only each title and
 * address, plus what already exists in the library; it reuses existing tags, hashtags and collections first and may
 * propose new tags, hashtags and collections (in an existing space) only when nothing fits.
 * Returns one entry per input page, in order.
 */
export async function suggestCardDetails(
  config: AiConfig,
  pages: readonly PageRef[],
  context: LabelContext,
  fetchImpl?: FetchLike,
): Promise<CardDetails[]> {
  if (pages.length === 0) throw new AiError(tr()('err.aiNoLinks'));
  if (pages.length > MAX_DETAILS_PER_REQUEST) throw new AiError(tr()('err.aiMaxLinks', { max: MAX_DETAILS_PER_REQUEST }));
  const fullName = (c: { space: string; title: string }) => `${c.space} / ${c.title}`;
  const spaces = [...new Set(context.collections.map((c) => c.space))];
  const answer = await complete(
    config,
    {
      system:
        'You help to sort a personal bookmark library. For each numbered link you know only its title and address. ' +
        'Reply with only JSON: [{"n":1,"note":"...","tag":"Tag name","hashtags":["topic","another"],"collection":"Space / Collection"}]. ' +
        'Rules: "note" is one short sentence (at most 140 characters) saying what the page is, in the language of its title; ' +
        'use an empty string when you are not sure what the page is, never guess or invent details. ' +
        '"tag" is exactly one tag, the single most fitting category: take it from the existing tags list when one fits, otherwise propose a short new one (one or two words). ' +
        `"hashtags" holds 3 to ${MAX_SUGGESTED_HASHTAGS} lowercase single-word topics: use existing hashtags first and add new ones for what they do not cover. ` +
        '"collection" is where the link belongs: copy one entry of the existing collections list exactly as written, or use null when none fits. ' +
        'When none fits you may give "newCollection":{"space":"Existing space name","title":"Short title"} instead, using only a space from the existing spaces list. ' +
        'Give one entry per link. No commentary.',
      prompt: [
        named('Existing tags', context.tags),
        named('Existing hashtags', context.hashtags),
        named('Existing spaces', spaces),
        named('Existing collections', context.collections.map(fullName)),
        '',
        `Links:\n${list(pages)}`,
      ].join('\n'),
      maxTokens: 700 + pages.length * 250,
    },
    fetchImpl,
  );
  const parsed = DetailsSchema.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiError(tr()('err.aiNoSuggestions'));

  const tagByLower = new Map(context.tags.map((t) => [t.toLowerCase(), t]));
  const knownHashtags = new Set(context.hashtags);
  const collectionByName = new Map(context.collections.map((c) => [fullName(c).toLowerCase(), c]));
  const spaceByLower = new Map(spaces.map((sp) => [sp.toLowerCase(), sp]));
  return pages.map((_, i) => {
    const entry = parsed.data.find((e) => e.n === i + 1);
    const tagText = (entry?.tag ?? '').trim().replace(/^#+/, '').slice(0, NAME_LIMIT);
    const tag = tagText === '' ? null : (tagByLower.get(tagText.toLowerCase()) ?? tagText);
    const hashtags = [...new Set((entry?.hashtags ?? []).map(normalizeHashtag).filter((h) => h !== ''))].slice(0, MAX_SUGGESTED_HASHTAGS);

    let destination: SuggestedDestination | null = null;
    const existing = collectionByName.get((entry?.collection ?? '').trim().toLowerCase());
    if (existing) {
      destination = { space: existing.space, collection: existing.title, isNew: false };
    } else if (entry?.newCollection) {
      const space = spaceByLower.get(entry.newCollection.space.trim().toLowerCase());
      const title = entry.newCollection.title.trim().slice(0, 60);
      if (space && title !== '') destination = { space, collection: title, isNew: true };
    }
    return {
      note: (entry?.note ?? '').trim().slice(0, NOTE_LIMIT),
      tags: tag === null ? [] : [tag],
      newTags: tag !== null && !tagByLower.has(tag.toLowerCase()) ? [tag] : [],
      hashtags,
      newHashtags: hashtags.filter((h) => !knownHashtags.has(h)),
      destination,
    };
  });
}

/**
 * Cheap call used by the "Test connection" button. A successful HTTP answer proves the key, model and network
 * work, so a reply without text (a reasoning model that used its small budget) still counts as connected.
 */
export async function testConnection(config: AiConfig, fetchImpl?: FetchLike): Promise<void> {
  await complete(config, { system: 'Reply with the single word: ok', prompt: 'ping', maxTokens: 64 }, fetchImpl, {
    allowEmpty: true,
  });
}
