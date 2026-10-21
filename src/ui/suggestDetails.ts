import { type AiConfig } from '../core/ai/client';
import { type CardDetails, MAX_DETAILS_PER_REQUEST, suggestCardDetails } from '../core/ai/tasks';
import { db } from '../core/instance';
import { loadLabelContext } from '../core/organise';
import type { Card } from '../core/types';
import type { Platform } from '../platform/ports';
import { withProviderAccess } from './ai';
import type { ProposedDetails } from './dialogs/AiDetailsDialog';

export const EMPTY_DETAILS: CardDetails = { note: '', tags: [], newTags: [], hashtags: [], newHashtags: [], destination: null };

/** Asks the AI for details of up to 30 links. Call it straight from a click: the first step may show a permission prompt. */
export async function proposeDetails(platform: Platform, ai: AiConfig, cards: readonly Card[]): Promise<{ items: ProposedDetails[]; skipped: number }> {
  const targets = cards.slice(0, MAX_DETAILS_PER_REQUEST);
  const context = await loadLabelContext(db);
  const details = await withProviderAccess(platform, ai, () =>
    suggestCardDetails(
      ai,
      targets.map((c) => ({ title: c.customTitle ?? c.title, url: c.url })),
      context,
    ),
  );
  return { items: targets.map((card, i) => ({ card, details: details[i] ?? EMPTY_DETAILS })), skipped: cards.length - targets.length };
}
