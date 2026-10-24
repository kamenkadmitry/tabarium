import { ArrowUpDown, ChevronLeft, ChevronRight, FolderPlus, Hash, LayoutGrid, List, Minus, Palette, PanelTop, Plus, Rows3, Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { type BoardFilter, isFiltering, NO_FILTER } from '../core/board';
import type { BoardSort, BoardView } from '../core/boardTypes';
import type { Tag as TagType } from '../core/types';
import { useT } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/messages';
import { SWATCHES } from './colors';
import { useLabels } from './labels';
import { Menu, MenuItem } from './Menu';

const SORTS: { value: BoardSort; labelKey: StringKey }[] = [
  { value: 'custom', labelKey: 'board.sort.custom' },
  { value: 'name-asc', labelKey: 'board.sort.nameAsc' },
  { value: 'name-desc', labelKey: 'board.sort.nameDesc' },
  { value: 'newest', labelKey: 'board.sort.newest' },
  { value: 'oldest', labelKey: 'board.sort.oldest' },
  { value: 'most-tabs', labelKey: 'board.sort.mostTabs' },
];

const VIEWS: { value: BoardView; labelKey: StringKey; icon: React.ReactNode }[] = [
  { value: 'card', labelKey: 'board.view.card', icon: <LayoutGrid size={16} aria-hidden /> },
  { value: 'compact', labelKey: 'board.view.compact', icon: <Rows3 size={16} aria-hidden /> },
  { value: 'list', labelKey: 'board.view.list', icon: <List size={16} aria-hidden /> },
  { value: 'grid', labelKey: 'board.view.grid', icon: <PanelTop size={16} aria-hidden /> },
];

interface Props {
  sort: BoardSort;
  onSort: (sort: BoardSort) => void;
  view: BoardView;
  onView: (view: BoardView) => void;
  filter: BoardFilter;
  onFilter: (filter: BoardFilter) => void;
  /** Tags used by collections of this space. */
  tags: readonly TagType[];
  /** Colours used by collections of this space. */
  colors: readonly string[];
  /** Hashtags used by links of this space, with how many links carry each. */
  hashtags: readonly { id: string; name: string; count: number }[];
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onNewCollection: () => void;
}

function FilterMenu({ filter, onFilter, tags, colors, hashtags, close }: Pick<Props, 'filter' | 'onFilter' | 'tags' | 'colors' | 'hashtags'> & { close: () => void }) {
  const t = useT();
  const [page, setPage] = useState<'root' | 'colour' | 'tags' | 'hashtags'>('root');
  const [search, setSearch] = useState('');
  const swatchName = (value: string) => {
    const s = SWATCHES.find((x) => x.value === value);
    return s ? t(s.key) : value;
  };

  if (page === 'root') {
    return (
      <>
        <MenuItem icon={<Palette size={16} aria-hidden />} onClick={() => setPage('colour')}>
          {t('board.filter.colour')} <ChevronRight size={14} aria-hidden className="float-right mt-1 text-muted" />
        </MenuItem>
        <MenuItem icon={<Tag size={16} aria-hidden />} onClick={() => setPage('tags')}>
          {t('board.filter.tags')} <ChevronRight size={14} aria-hidden className="float-right mt-1 text-muted" />
        </MenuItem>
        <MenuItem icon={<Hash size={16} aria-hidden />} onClick={() => setPage('hashtags')}>
          {t('board.filter.hashtags')} <ChevronRight size={14} aria-hidden className="float-right mt-1 text-muted" />
        </MenuItem>
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setPage('root')} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-surface-2">
        <ChevronLeft size={15} aria-hidden /> {page === 'colour' ? t('board.filter.colour') : page === 'tags' ? t('board.filter.tags') : t('board.filter.hashtags')}
      </button>
      {page === 'colour' && (
        <>
          {colors.map((c) => (
            <MenuItem
              key={c}
              checked={filter.color === c}
              icon={<span aria-hidden className="size-3 rounded-full" style={{ background: c }} />}
              onClick={() => {
                onFilter({ ...filter, color: filter.color === c ? null : c });
                close();
              }}
            >
              {swatchName(c)}
            </MenuItem>
          ))}
          <MenuItem
            checked={filter.color === 'none'}
            onClick={() => {
              onFilter({ ...filter, color: filter.color === 'none' ? null : 'none' });
              close();
            }}
          >
            {t('board.filter.noColour')}
          </MenuItem>
        </>
      )}
      {page === 'hashtags' && (
        <div className="w-72">
          <label className="relative m-1 block">
            <span className="sr-only">{t('board.searchHashtags')}</span>
            <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('board.searchHashtags')}
              className="h-9 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-sm placeholder:text-muted"
            />
          </label>
          <div role="group" aria-label={t('board.filter.hashtags')} className="max-h-64 overflow-y-auto">
            {hashtags
              .filter((h) => h.name.includes(search.trim().toLowerCase().replace(/^#/, '')))
              .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
              .map((h) => {
                const on = filter.hashtagIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onFilter({ ...filter, hashtagIds: on ? filter.hashtagIds.filter((x) => x !== h.id) : [...filter.hashtagIds, h.id] })}
                    className={`flex min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-2 ${on ? 'bg-surface-2 font-semibold' : ''}`}
                  >
                    <span aria-hidden className={`grid size-4 place-items-center rounded border-2 text-[10px] ${on ? 'border-primary bg-primary text-primary-fg' : 'border-line'}`}>
                      {on ? '✓' : ''}
                    </span>
                    <span className="flex-1 truncate text-primary">#{h.name}</span>
                    <span className="text-xs text-muted">{h.count}</span>
                  </button>
                );
              })}
            {hashtags.length === 0 && <p className="px-3 py-3 text-sm text-muted">{t('board.noHashtagsHere')}</p>}
          </div>
          {filter.hashtagIds.length > 0 && (
            <button type="button" onClick={() => onFilter({ ...filter, hashtagIds: [] })} className="mt-1 w-full border-t border-line px-3 py-2 text-left text-xs font-bold text-primary">
              {t('board.clearHashtags')}
            </button>
          )}
        </div>
      )}
      {page === 'tags' && (
        <>
          {tags.map((tag) => (
            <MenuItem
              key={tag.id}
              checked={filter.tagId === tag.id}
              icon={<span aria-hidden className="size-3 rounded-full" style={{ background: tag.color }} />}
              onClick={() => {
                onFilter({ ...filter, tagId: filter.tagId === tag.id ? null : tag.id });
                close();
              }}
            >
              {tag.title}
            </MenuItem>
          ))}
          {tags.length === 0 && <p className="px-3 py-3 text-sm text-muted">{t('board.noTagsHere')}</p>}
        </>
      )}
    </>
  );
}

/** Sort, filter and layout controls above the board, plus expand/collapse-all and "New collection". */
export function BoardToolbar(props: Props) {
  const t = useT();
  const activeView = VIEWS.find((v) => v.value === props.view) ?? VIEWS[3];
  const activeSort = SORTS.find((s) => s.value === props.sort) ?? SORTS[0];
  // Link-tag chips come from card clicks, so they may name tags that no collection uses — resolve all, not just props.tags.
  const { tags: allTags } = useLabels();
  const filterChips: { key: string; label: string; clear: () => void }[] = [];
  if (props.filter.color !== null) {
    const swatch = SWATCHES.find((s) => s.value === props.filter.color);
    filterChips.push({
      key: 'colour',
      label: props.filter.color === 'none' ? t('board.filter.noColour') : swatch ? t(swatch.key) : t('board.filter.colour'),
      clear: () => props.onFilter({ ...props.filter, color: null }),
    });
  }
  if (props.filter.tagId !== null) {
    filterChips.push({
      key: 'tag',
      label: props.tags.find((tag) => tag.id === props.filter.tagId)?.title ?? t('board.filter.tag'),
      clear: () => props.onFilter({ ...props.filter, tagId: null }),
    });
  }

  for (const id of props.filter.hashtagIds) {
    filterChips.push({
      key: `hashtag-${id}`,
      label: `#${props.hashtags.find((h) => h.id === id)?.name ?? t('board.filter.hashtag')}`,
      clear: () => props.onFilter({ ...props.filter, hashtagIds: props.filter.hashtagIds.filter((x) => x !== id) }),
    });
  }
  for (const id of props.filter.cardTagIds) {
    filterChips.push({
      key: `cardtag-${id}`,
      label: allTags.get(id)?.title ?? t('board.filter.tag'),
      clear: () => props.onFilter({ ...props.filter, cardTagIds: props.filter.cardTagIds.filter((x) => x !== id) }),
    });
  }

  return (
    <div role="toolbar" aria-label={t('board.options')} className="flex flex-wrap items-center gap-1">
      <Menu label={t(activeSort?.labelKey ?? 'board.sort.custom')} ariaLabel={t('board.sort')} icon={<ArrowUpDown size={15} aria-hidden />}>
        {(close) =>
          SORTS.map((s) => (
            <MenuItem
              key={s.value}
              checked={props.sort === s.value}
              onClick={() => {
                props.onSort(s.value);
                close();
              }}
            >
              {t(s.labelKey)}
            </MenuItem>
          ))
        }
      </Menu>

      <Menu label={t('common.filter')} ariaLabel={t('board.filter')} icon={<SlidersHorizontal size={15} aria-hidden />} active={isFiltering(props.filter)}>
        {(close) => <FilterMenu filter={props.filter} onFilter={props.onFilter} tags={props.tags} colors={props.colors} hashtags={props.hashtags} close={close} />}
      </Menu>

      <Menu label={t(activeView?.labelKey ?? 'board.view.grid')} ariaLabel={t('board.changeView')} icon={activeView?.icon}>
        {(close) =>
          VIEWS.map((v) => (
            <MenuItem
              key={v.value}
              checked={props.view === v.value}
              icon={v.icon}
              onClick={() => {
                props.onView(v.value);
                close();
              }}
            >
              {t(v.labelKey)}
            </MenuItem>
          ))
        }
      </Menu>

      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <button type="button" aria-label={t('board.expandAll')} onClick={props.onExpandAll} className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
        <Plus size={16} aria-hidden />
      </button>
      <button type="button" aria-label={t('board.collapseAll')} onClick={props.onCollapseAll} className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
        <Minus size={16} aria-hidden />
      </button>

      {filterChips.map((c) => (
        <span key={c.key} className="ml-2 flex h-7 items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 text-xs font-semibold">
          {c.label}
          <button type="button" aria-label={t('board.clearFilter', { name: c.label })} onClick={c.clear} className="grid size-5 place-items-center rounded-full hover:bg-line">
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      {filterChips.length > 1 && (
        <button type="button" onClick={() => props.onFilter(NO_FILTER)} className="ml-1 text-xs font-semibold text-primary underline">
          {t('board.clearAll')}
        </button>
      )}

      <button
        type="button"
        onClick={props.onNewCollection}
        className="anchor-undo ml-auto flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90"
      >
        <FolderPlus size={16} aria-hidden /> {t('board.newCollection')}
      </button>
    </div>
  );
}
