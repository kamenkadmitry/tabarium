import { z } from 'zod';
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
  if (start === -1) throw new AiError('The answer did not contain JSON.');
  const end = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'));
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AiError('The answer was not valid JSON.');
  }
}

const list = (pages: readonly PageRef[]) => pages.map((p, i) => `${i + 1}. ${p.title} — ${p.url}`).join('\n');

const NamesSchema = z.array(z.string().trim().min(1).max(60)).min(1);

/** Suggests short names for a collection holding these pages. */
export async function suggestCollectionNames(config: AiConfig, pages: readonly PageRef[], fetchImpl?: FetchLike): Promise<string[]> {
  if (pages.length === 0) throw new AiError('The collection is empty, so there is nothing to name.');
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
  if (!parsed.success) throw new AiError('The model did not return a list of names.');
  return [...new Set(parsed.data)].slice(0, 5);
}

export interface TabGroup {
  title: string;
  /** Indexes into the input array. */
  indexes: number[];
}

const GroupsSchema = z
  .array(z.object({ title: z.string().trim().min(1).max(60), tabs: z.array(z.number().int().min(1)).min(1) }))
  .min(1);

/** Splits pages into named groups. Every page ends up in exactly one group; unmentioned pages go to "Other". */
export async function groupTabs(config: AiConfig, pages: readonly PageRef[], fetchImpl?: FetchLike): Promise<TabGroup[]> {
  if (pages.length === 0) throw new AiError('There are no tabs to group.');
  const answer = await complete(
    config,
    {
      system:
        'You organise browser tabs into topic groups. Reply with only JSON: [{"title":"Group name","tabs":[1,2]}]. ' +
        'Use the tab numbers given, put each tab in exactly one group, use 2 to 6 groups, keep names under 4 words.',
      prompt: `Group these tabs:\n${list(pages.slice(0, 80))}`,
      maxTokens: 2400,
    },
    fetchImpl,
  );
  const parsed = GroupsSchema.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiError('The model did not return valid groups.');

  const limit = Math.min(pages.length, 80);
  const assigned = new Set<number>();
  const groups: TabGroup[] = [];
  for (const g of parsed.data) {
    const indexes = g.tabs.map((n) => n - 1).filter((i) => i < limit && !assigned.has(i));
    indexes.forEach((i) => assigned.add(i));
    if (indexes.length > 0) groups.push({ title: g.title, indexes });
  }
  const rest = pages.map((_, i) => i).filter((i) => !assigned.has(i));
  if (rest.length > 0) groups.push({ title: 'Other', indexes: rest });
  return groups;
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
