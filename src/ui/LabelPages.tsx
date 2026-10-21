import { Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Card, Hashtag, Tag } from '../core/types';
import { hostOf, PageFavicon } from './CardRow';
import { SWATCHES } from './colors';
import { inputClass } from './Dialog';

const box = 'rounded-2xl border border-line bg-surface';
const addButton =
  'flex h-11 shrink-0 items-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const trash = 'grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:text-danger';

function Segmented<T extends string>(props: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex overflow-hidden rounded-lg border border-line">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${props.value === o.value ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterChips<T extends string>(props: { label: string; value: T; options: readonly { value: T; label: string; count: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-2">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors duration-150 ${
            props.value === o.value ? 'border-primary bg-surface-2 text-fg' : 'border-line text-muted hover:text-fg'
          }`}
        >
          {o.label} {o.count}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative w-72 max-w-full">
      <span className="sr-only">{label}</span>
      <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className={`${inputClass} h-10 pl-9`} />
    </label>
  );
}

// ---------------------------------------------------------------------------------------------------- tags

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
  onDeleteUnused: () => void;
}

type TagSort = 'az' | 'used';
type TagFilter = 'all' | 'unused';

/** Coloured tags: they can be put on collections and on links. */
export function TagsPage({ tags, usage, onCreate, onUpdate, onDelete, onDeleteUnused }: TagsPageProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>(SWATCHES[0].value);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TagSort>('az');
  const [filter, setFilter] = useState<TagFilter>('all');

  const total = (id: string) => (usage.get(id)?.collections ?? 0) + (usage.get(id)?.links ?? 0);
  const unused = tags.filter((t) => total(t.id) === 0);
  const shown = tags
    .filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()) && (filter === 'all' || total(t.id) === 0))
    .sort((a, b) => (sort === 'used' ? total(b.id) - total(a.id) : 0) || a.title.localeCompare(b.title));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted">Coloured labels. Put them on collections (collection menu) and on links (when you edit a link).</p>
      <form
        className={`${box} p-4`}
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

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} label="Filter tags" />
        <Segmented
          label="Sort tags"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'az', label: 'A–Z' },
            { value: 'used', label: 'Most used' },
          ]}
        />
        <FilterChips
          label="Show tags"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: tags.length },
            { value: 'unused', label: 'Unused', count: unused.length },
          ]}
        />
        {unused.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete ${unused.length} unused tags?`)) onDeleteUnused();
            }}
            className="ml-auto h-9 rounded-lg border border-line px-3 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-surface-2"
          >
            Delete {unused.length} unused
          </button>
        )}
      </div>

      <ul aria-label="Tags" className={`${box} divide-y divide-line`}>
        {shown.map((t) => {
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
                <span className="hidden shrink-0 text-xs text-muted sm:block">
                  {u.collections} collection{u.collections === 1 ? '' : 's'} · {u.links} link{u.links === 1 ? '' : 's'}
                </span>
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
        {shown.length === 0 && <li className="p-6 text-center text-sm text-muted">{tags.length === 0 ? 'No tags yet.' : 'No tag matches.'}</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ hashtags

interface HashtagsPageProps {
  hashtags: readonly Hashtag[];
  /** Links, to list the ones that carry the selected hashtag. */
  cards: readonly Card[];
  /** Number of links per hashtag id. */
  usage: ReadonlyMap<string, number>;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMerge: (fromId: string, intoId: string) => void;
  onRemoveFrom: (card: Card, hashtagId: string) => void;
  onDeleteUnused: () => void;
}

type HashtagSort = 'az' | 'used' | 'newest';
type HashtagFilter = 'all' | 'once' | 'unused';
const PREVIEW = 8;

/** Free-form #hashtags for links. Built for hundreds of them: letter groups, counts, search, a side panel per hashtag. */
export function HashtagsPage({ hashtags, cards, usage, onCreate, onRename, onDelete, onMerge, onRemoveFrom, onDeleteUnused }: HashtagsPageProps) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HashtagSort>('az');
  const [filter, setFilter] = useState<HashtagFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mergeInto, setMergeInto] = useState('');

  const count = (id: string) => usage.get(id) ?? 0;
  const unused = hashtags.filter((h) => count(h.id) === 0);
  const once = hashtags.filter((h) => count(h.id) === 1);
  const needle = search.trim().toLowerCase().replace(/^#/, '');
  const shown = hashtags
    .filter((h) => h.name.includes(needle) && (filter === 'all' || (filter === 'once' ? count(h.id) === 1 : count(h.id) === 0)))
    .sort((a, b) => {
      if (sort === 'used') return count(b.id) - count(a.id) || a.name.localeCompare(b.name);
      if (sort === 'newest') return b.createdAt - a.createdAt || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  const groups = new Map<string, Hashtag[]>();
  if (sort === 'az') {
    for (const h of shown) {
      const letter = /^\p{L}/u.test(h.name) ? (h.name[0] ?? '#').toUpperCase() : '#';
      groups.set(letter, [...(groups.get(letter) ?? []), h]);
    }
  } else {
    groups.set('', shown);
  }

  const selected = hashtags.find((h) => h.id === selectedId);
  const links = selected ? cards.filter((c) => c.hashtagIds.includes(selected.id)) : [];
  const select = (id: string) => {
    setSelectedId(selectedId === id ? null : id);
    setShowAll(false);
    setMergeInto('');
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted">Quick topic labels for links, like #rust or #to-read. No colours, no limit.</p>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') return;
          onCreate(name);
          setName('');
        }}
      >
        <input aria-label="Hashtag name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New hashtag, e.g. #to-read" className={inputClass} />
        <button className={addButton} disabled={name.trim() === ''}>
          Add
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} label="Filter hashtags" />
        <Segmented
          label="Sort hashtags"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'az', label: 'A–Z' },
            { value: 'used', label: 'Most used' },
            { value: 'newest', label: 'Newest' },
          ]}
        />
        <FilterChips
          label="Show hashtags"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: hashtags.length },
            { value: 'once', label: 'Used once', count: once.length },
            { value: 'unused', label: 'Unused', count: unused.length },
          ]}
        />
        {unused.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete ${unused.length} unused hashtags?`)) onDeleteUnused();
            }}
            className="ml-auto h-9 rounded-lg border border-line px-3 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-surface-2"
          >
            Delete {unused.length} unused
          </button>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div aria-label="Hashtags" role="group" className="min-w-0 flex-1">
          {[...groups].map(([letter, list]) => (
            <div key={letter} className="mb-3 flex gap-3">
              {letter !== '' && <h3 className="w-5 shrink-0 pt-1.5 text-sm font-extrabold text-muted">{letter}</h3>}
              <ul className="flex flex-wrap gap-2">
                {list.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === h.id}
                      onClick={() => select(h.id)}
                      className={`flex h-8 items-center gap-2 rounded-full border pl-3 pr-1.5 text-sm font-semibold transition-colors duration-150 ${
                        selectedId === h.id ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-primary hover:bg-surface-2'
                      }`}
                    >
                      #{h.name}
                      <span className={`rounded-full px-1.5 text-[11px] font-bold ${selectedId === h.id ? 'bg-black/20 text-primary-fg' : 'bg-surface-2 text-muted'}`}>{count(h.id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {shown.length === 0 && <p className="py-6 text-sm text-muted">{hashtags.length === 0 ? 'No hashtags yet.' : 'No hashtag matches.'}</p>}
        </div>

        {selected && (
          <aside aria-label={`Hashtag ${selected.name}`} className={`${box} w-full shrink-0 p-4 lg:sticky lg:top-0 lg:w-[22rem]`}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex-1 truncate text-xl font-extrabold text-primary">#{selected.name}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">
                {links.length} link{links.length === 1 ? '' : 's'}
              </span>
              <button type="button" aria-label="Close hashtag panel" onClick={() => setSelectedId(null)} className="grid size-8 place-items-center rounded-md text-muted hover:text-fg">
                <X size={16} aria-hidden />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Name</span>
              <input
                key={selected.name}
                aria-label={`Name of hashtag ${selected.name}`}
                defaultValue={selected.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== '' && next !== selected.name) onRename(selected.id, next);
                  else e.target.value = selected.name;
                }}
                className={inputClass}
              />
            </label>
            <div className="mb-4 flex gap-2">
              <select
                aria-label="Merge into"
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm"
              >
                <option value="">Merge into…</option>
                {hashtags
                  .filter((h) => h.id !== selected.id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      #{h.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={mergeInto === ''}
                onClick={() => {
                  const target = hashtags.find((h) => h.id === mergeInto);
                  if (target && confirm(`Move all links from #${selected.name} to #${target.name} and delete #${selected.name}?`)) {
                    onMerge(selected.id, target.id);
                    setSelectedId(target.id);
                    setMergeInto('');
                  }
                }}
                className="h-10 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
              >
                Merge
              </button>
              <button
                type="button"
                aria-label={`Delete hashtag ${selected.name}`}
                onClick={() => {
                  if (confirm(`Delete #${selected.name}? It will be removed from ${links.length} links.`)) {
                    onDelete(selected.id);
                    setSelectedId(null);
                  }
                }}
                className="grid size-10 place-items-center rounded-lg border border-line text-danger hover:bg-surface-2"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            <p className="mb-1 text-xs font-semibold text-muted">Links with this hashtag</p>
            <ul aria-label="Links with this hashtag">
              {(showAll ? links : links.slice(0, PREVIEW)).map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
                  <PageFavicon url={c.url} favIconUrl={c.favIconUrl} size={18} />
                  <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.customTitle ?? c.title}</span>
                    <span className="block truncate text-xs text-muted">{hostOf(c.url)}</span>
                  </a>
                  <button
                    type="button"
                    aria-label={`Remove #${selected.name} from ${c.customTitle ?? c.title}`}
                    onClick={() => onRemoveFrom(c, selected.id)}
                    className="grid size-7 place-items-center rounded-md text-muted hover:text-danger"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
              {links.length === 0 && <li className="py-2 text-sm text-muted">No links use it yet.</li>}
            </ul>
            {links.length > PREVIEW && (
              <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-sm font-semibold text-primary">
                {showAll ? 'Show fewer' : `Show all ${links.length}`}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
