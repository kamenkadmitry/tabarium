import { Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Hashtag, Tag } from '../core/types';
import { SWATCHES } from './colors';
import { inputClass } from './Dialog';

const card = 'max-w-2xl rounded-2xl border border-line bg-surface';
const addButton =
  'flex h-11 shrink-0 items-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const trash = 'grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:text-danger';

function Usage({ parts }: { parts: string[] }) {
  return <span className="hidden shrink-0 text-xs text-muted sm:block">{parts.join(' · ')}</span>;
}

interface TagUsage {
  collections: number;
  links: number;
}

interface TagsPageProps {
  tags: readonly Tag[];
  usage: ReadonlyMap<string, TagUsage>;
  onCreate: (title: string, color: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<Tag, 'title' | 'color'>>) => void;
  onDelete: (id: string) => void;
}

/** Coloured tags: they can be put on collections and on links. */
export function TagsPage({ tags, usage, onCreate, onUpdate, onDelete }: TagsPageProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0].value);
  const [colorFor, setColorFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted">Coloured labels. Put them on collections (collection menu) and on links (when you edit a link).</p>
      <form
        className={`${card} p-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() === '') return;
          onCreate(title.trim(), color);
          setTitle('');
        }}
      >
        <p className="mb-2 text-sm font-semibold">New tag</p>
        <div className="flex gap-2">
          <input aria-label="Tag name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tag name" className={inputClass} />
          <button className={addButton} disabled={title.trim() === ''}>
            Add
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="New tag colour">
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={color === s.value}
              aria-label={s.name}
              onClick={() => setColor(s.value)}
              className="size-7 rounded-full border-2 border-transparent aria-checked:border-fg"
              style={{ background: s.value }}
            />
          ))}
        </div>
      </form>

      <ul aria-label="Tags" className={`${card} divide-y divide-line`}>
        {tags.map((t) => {
          const u = usage.get(t.id) ?? { collections: 0, links: 0 };
          return (
            <li key={t.id} className="px-4 py-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Change colour of ${t.title}`}
                  aria-expanded={colorFor === t.id}
                  onClick={() => setColorFor(colorFor === t.id ? null : t.id)}
                  className="size-5 shrink-0 rounded-full"
                  style={{ background: t.color }}
                />
                <input
                  aria-label={`Name of tag ${t.title}`}
                  key={t.title}
                  defaultValue={t.title}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== '' && next !== t.title) onUpdate(t.id, { title: next });
                    else e.target.value = t.title;
                  }}
                  className="h-10 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm font-medium hover:bg-surface-2 focus:bg-surface-2"
                />
                <Usage parts={[`${u.collections} collection${u.collections === 1 ? '' : 's'}`, `${u.links} link${u.links === 1 ? '' : 's'}`]} />
                <button
                  type="button"
                  aria-label={`Delete tag ${t.title}`}
                  onClick={() => {
                    if (confirm(`Delete the tag “${t.title}”? It will be removed from ${u.collections} collections and ${u.links} links.`)) onDelete(t.id);
                  }}
                  className={trash}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              {colorFor === t.id && (
                <div className="flex flex-wrap gap-2 pb-2 pl-8 pt-1" role="radiogroup" aria-label={`Colour of ${t.title}`}>
                  {SWATCHES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={t.color === s.value}
                      aria-label={s.name}
                      onClick={() => {
                        onUpdate(t.id, { color: s.value });
                        setColorFor(null);
                      }}
                      className="size-6 rounded-full border-2 border-transparent aria-checked:border-fg"
                      style={{ background: s.value }}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {tags.length === 0 && <li className="p-6 text-center text-sm text-muted">No tags yet.</li>}
      </ul>
    </div>
  );
}

interface HashtagsPageProps {
  hashtags: readonly Hashtag[];
  /** Number of links per hashtag id. */
  usage: ReadonlyMap<string, number>;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Free-form #hashtags for links. They are also created on the fly while editing a link or by the AI. */
export function HashtagsPage({ hashtags, usage, onCreate, onRename, onDelete }: HashtagsPageProps) {
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const shown = hashtags.filter((h) => h.name.includes(filter.trim().toLowerCase().replace(/^#/, '')));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted">Quick topic labels for links, like #rust or #to-read. No colours, no limit.</p>
      <form
        className={`${card} p-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') return;
          onCreate(name);
          setName('');
        }}
      >
        <p className="mb-2 text-sm font-semibold">New hashtag</p>
        <div className="flex gap-2">
          <input aria-label="Hashtag name" value={name} onChange={(e) => setName(e.target.value)} placeholder="#hashtag" className={inputClass} />
          <button className={addButton} disabled={name.trim() === ''}>
            Add
          </button>
        </div>
      </form>

      <label className="relative max-w-2xl">
        <span className="sr-only">Filter hashtags</span>
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter hashtags" className={`${inputClass} pl-9`} />
      </label>

      <ul aria-label="Hashtags" className={`${card} divide-y divide-line`}>
        {shown.map((h) => {
          const links = usage.get(h.id) ?? 0;
          return (
            <li key={h.id} className="flex items-center gap-3 px-4 py-2">
              <span aria-hidden className="text-sm font-bold text-primary">
                #
              </span>
              <input
                aria-label={`Name of hashtag ${h.name}`}
                key={h.name}
                defaultValue={h.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== '' && next !== h.name) onRename(h.id, next);
                  else e.target.value = h.name;
                }}
                className="h-10 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm font-medium hover:bg-surface-2 focus:bg-surface-2"
              />
              <Usage parts={[`${links} link${links === 1 ? '' : 's'}`]} />
              <button
                type="button"
                aria-label={`Delete hashtag ${h.name}`}
                onClick={() => {
                  if (confirm(`Delete #${h.name}? It will be removed from ${links} links.`)) onDelete(h.id);
                }}
                className={trash}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="p-6 text-center text-sm text-muted">{hashtags.length === 0 ? 'No hashtags yet.' : 'No hashtag matches.'}</li>}
      </ul>
    </div>
  );
}
