import { createContext, useContext, useMemo } from 'react';
import { normalizeHashtag } from '../core/hashtag';
import type { Card, Hashtag, Tag } from '../core/types';
import { LabelPicker } from './LabelPicker';

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

/** The tags (coloured dot) and #hashtags of a card, as one wrapped line. */
export function CardLabels({ card }: { card: Card }) {
  const { tags, hashtags } = useContext(LabelsContext);
  const cardTags = card.tagIds.flatMap((id) => tags.get(id) ?? []);
  const cardHashtags = card.hashtagIds.flatMap((id) => hashtags.get(id) ?? []);
  if (cardTags.length === 0 && cardHashtags.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {cardTags.map((t) => (
        <span key={t.id} className="flex items-center gap-1 font-medium">
          <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
          {t.title}
        </span>
      ))}
      {cardHashtags.map((h) => (
        <span key={h.id} className="font-medium text-primary">
          #{h.name}
        </span>
      ))}
    </span>
  );
}

export interface LabelsApi {
  tags: readonly Tag[];
  hashtags: readonly Hashtag[];
  createTag: (name: string) => Promise<string>;
  createHashtag: (name: string) => Promise<string>;
}

interface FieldsProps {
  api: LabelsApi;
  tagIds: readonly string[];
  hashtagIds: readonly string[];
  onTags: (ids: string[]) => void;
  onHashtags: (ids: string[]) => void;
}

/** The two pickers used when a link is created or edited. */
export function LabelFields({ api, tagIds, hashtagIds, onTags, onHashtags }: FieldsProps) {
  return (
    <>
      <LabelPicker
        title="Tags"
        items={api.tags.map((t) => ({ id: t.id, label: t.title, color: t.color }))}
        selected={tagIds}
        onChange={onTags}
        onCreate={api.createTag}
      />
      <LabelPicker
        title="Hashtags"
        prefix="#"
        items={api.hashtags.map((h) => ({ id: h.id, label: h.name }))}
        selected={hashtagIds}
        onChange={onHashtags}
        onCreate={api.createHashtag}
        normalize={normalizeHashtag}
      />
    </>
  );
}
