import { createContext, useContext, useMemo } from 'react';
import { normalizeHashtag } from '../core/hashtag';
import type { Card, Hashtag, Tag } from '../core/types';
import { LabelChips } from './LabelChips';

interface Labels {
  tags: ReadonlyMap<string, Tag>;
  hashtags: ReadonlyMap<string, Hashtag>;
}

const LabelsContext = createContext<Labels>({ tags: new Map(), hashtags: new Map() });

/** Lets any card row resolve its tag and hashtag ids to names without passing them down through every layer. */
export function LabelsProvider({ tags, hashtags, children }: { tags: readonly Tag[]; hashtags: readonly Hashtag[]; children: React.ReactNode }) {
  const value = useMemo(() => ({ tags: new Map(tags.map((t) => [t.id, t])), hashtags: new Map(hashtags.map((h) => [h.id, h])) }), [tags, hashtags]);
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
}

interface CardLabelsProps {
  card: Card;
  /** Text shown first on the line, usually the site. It shrinks before the labels do. */
  lead?: string;
  /** "line": tag, hashtags and "+N". "dots": coloured dots for tags and "+N" for hashtags (Compact view). */
  variant?: 'line' | 'dots';
  limitTags?: number;
  limitHashtags?: number;
  className?: string;
}

/** The labels of a card on one line that never wraps: a few of them, then "+N" for the rest. */
export function CardLabels({ card, lead, variant = 'line', limitTags = 1, limitHashtags = 2, className = '' }: CardLabelsProps) {
  const { tags, hashtags } = useContext(LabelsContext);
  const cardTags = card.tagIds.flatMap((id) => tags.get(id) ?? []);
  const cardHashtags = card.hashtagIds.flatMap((id) => hashtags.get(id) ?? []);
  if (variant === 'dots') {
    if (cardTags.length === 0 && cardHashtags.length === 0) return null;
    return (
      <span className={`flex shrink-0 items-center gap-1.5 ${className}`}>
        {cardTags.slice(0, 3).map((t) => (
          <span key={t.id} title={t.title} className="size-2 rounded-full" style={{ background: t.color }} />
        ))}
        {cardHashtags.length > 0 && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-bold text-muted">+{cardHashtags.length}</span>}
      </span>
    );
  }
  if (lead === undefined && cardTags.length === 0 && cardHashtags.length === 0) return null;
  const shownTags = cardTags.slice(0, limitTags);
  const shownHashtags = cardHashtags.slice(0, limitHashtags);
  const rest = cardTags.length - shownTags.length + (cardHashtags.length - shownHashtags.length);
  return (
    <span className={`flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs ${className}`}>
      {lead !== undefined && <span className="min-w-0 shrink truncate text-muted">{lead}</span>}
      {shownTags.map((t) => (
        <span key={t.id} className="flex shrink-0 items-center gap-1 font-medium">
          <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
          {t.title}
        </span>
      ))}
      {shownHashtags.map((h) => (
        <span key={h.id} className="min-w-0 shrink truncate font-medium text-primary">
          #{h.name}
        </span>
      ))}
      {rest > 0 && (
        <span aria-label={`${rest} more labels`} className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] font-bold text-muted">
          +{rest}
        </span>
      )}
    </span>
  );
}

export interface LabelsApi {
  tags: readonly Tag[];
  hashtags: readonly Hashtag[];
  /** Links per tag and per hashtag id, for suggestions. */
  tagUsage: ReadonlyMap<string, number>;
  hashtagUsage: ReadonlyMap<string, number>;
  /** Colours offered when a tag is created from the editor. */
  swatches: readonly string[];
  createTag: (name: string, color?: string) => Promise<string>;
  createHashtag: (name: string) => Promise<string>;
}

interface FieldsProps {
  api: LabelsApi;
  tagIds: readonly string[];
  hashtagIds: readonly string[];
  onTags: (ids: string[]) => void;
  onHashtags: (ids: string[]) => void;
}

/** The two label rows used when a link is created or edited. */
export function LabelFields({ api, tagIds, hashtagIds, onTags, onHashtags }: FieldsProps) {
  return (
    <>
      <LabelChips
        title="Tags"
        noun="tag"
        items={api.tags.map((t) => ({ id: t.id, label: t.title, color: t.color, count: api.tagUsage.get(t.id) ?? 0 }))}
        selected={tagIds}
        onChange={onTags}
        onCreate={api.createTag}
        swatches={api.swatches}
      />
      <LabelChips
        title="Hashtags"
        noun="hashtag"
        prefix="#"
        items={api.hashtags.map((h) => ({ id: h.id, label: h.name, count: api.hashtagUsage.get(h.id) ?? 0 }))}
        selected={hashtagIds}
        onChange={onHashtags}
        onCreate={api.createHashtag}
        normalize={normalizeHashtag}
      />
    </>
  );
}
