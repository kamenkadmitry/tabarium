import { ChevronRight, Folder, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type BookmarkImportMode, type BookmarkNode, countBookmarks, planBookmarkImport } from '../core/bookmarks';
import { db, repo } from '../core/instance';
import { saveToInbox } from '../core/quicksave';
import type { Card } from '../core/types';
import { normalizeUrl } from '../core/url';
import { useT } from '../i18n/I18nProvider';
import type { StringKey } from '../i18n/messages';
import { usePlatform } from '../platform/context';
import { radioGroupKeyDown, radioTab } from './a11y';
import { hostOf, PageFavicon } from './CardRow';
import { useDuplicateGuard } from './DuplicateGuard';
import { inputClass, PrimaryButton, SecondaryButton } from './Dialog';

const box = 'rounded-2xl border border-line bg-surface';

const MODES: { value: BookmarkImportMode; titleKey: StringKey; hintKey: StringKey }[] = [
  { value: 'one', titleKey: 'bm.oneCollection', hintKey: 'bm.oneCollectionHint' },
  { value: 'folders', titleKey: 'bm.keepFolders', hintKey: 'bm.keepFoldersHint' },
];

interface Selection {
  has: (id: string) => boolean;
  /** Ticks or unticks every bookmark of the given ids. */
  set: (ids: readonly string[], on: boolean) => void;
}

const checkbox = 'size-4 shrink-0 accent-[var(--primary)]';
const webIds = (nodes: readonly BookmarkNode[]) => flatten(nodes).filter((n) => /^https?:\/\//i.test(n.url ?? '')).map((n) => n.id);

function BookmarkRow({ node, saved, sel }: { node: BookmarkNode; saved: boolean; sel: Selection }) {
  const t = useT();
  const url = node.url ?? '';
  return (
    <li className="flex min-h-10 items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-2">
      <input
        type="checkbox"
        aria-label={t('bm.select', { title: node.title || url })}
        checked={sel.has(node.id)}
        onChange={(e) => sel.set([node.id], e.target.checked)}
        className={checkbox}
      />
      <PageFavicon url={url} favIconUrl={null} size={18} />
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{node.title || url}</span>
        <span className="block truncate text-xs text-muted">{hostOf(url)}</span>
      </a>
      {saved && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-primary">{t('bm.inTabarium')}</span>}
    </li>
  );
}

function FolderNode({ node, known, depth, sel }: { node: BookmarkNode; known: ReadonlySet<string>; depth: number; sel: Selection }) {
  const t = useT();
  const [open, setOpen] = useState(depth === 0);
  const count = countBookmarks(node.children ?? []);
  const ids = webIds(node.children ?? []);
  const ticked = ids.filter((id) => sel.has(id)).length;
  return (
    <li>
      <div className="flex items-center gap-2 rounded-lg pl-2 hover:bg-surface-2">
        <input
          type="checkbox"
          aria-label={t('bm.selectAllIn', { title: node.title || t('common.untitled') })}
          checked={ids.length > 0 && ticked === ids.length}
          ref={(el) => {
            if (el) el.indeterminate = ticked > 0 && ticked < ids.length;
          }}
          disabled={ids.length === 0}
          onChange={(e) => sel.set(ids, e.target.checked)}
          className={checkbox}
        />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left"
      >
        <ChevronRight size={16} aria-hidden className={`shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        <Folder size={16} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{node.title || t('common.untitled')}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{t.num(count)}</span>
      </button>
      </div>
      {open && <Nodes nodes={node.children ?? []} known={known} depth={depth + 1} sel={sel} />}
    </li>
  );
}

function Nodes({ nodes, known, depth, sel }: { nodes: readonly BookmarkNode[]; known: ReadonlySet<string>; depth: number; sel: Selection }) {
  return (
    <ul className={depth > 0 ? 'ml-4 border-l border-line pl-2' : ''}>
      {nodes.map((n) =>
        n.url === undefined ? (
          <FolderNode key={n.id} node={n} known={known} depth={depth} sel={sel} />
        ) : (
          <BookmarkRow key={n.id} node={n} saved={known.has(normalizeUrl(n.url))} sel={sel} />
        ),
      )}
    </ul>
  );
}

function flatten(nodes: readonly BookmarkNode[]): BookmarkNode[] {
  return nodes.flatMap((n) => (n.url !== undefined ? [n] : flatten(n.children ?? [])));
}

interface Props {
  /** Every link of the library, to tell which bookmarks are saved already. */
  cards: readonly Card[];
  run: (what: string, action: () => Promise<void>) => Promise<void>;
}

/** The bookmarks of the browser, read live. They can be copied into Tabarium and then removed from the bookmarks bar. */
export function BookmarksPage({ cards, run }: Props) {
  const t = useT();
  const platform = usePlatform();
  const guard = useDuplicateGuard();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tree, setTree] = useState<BookmarkNode[] | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<BookmarkImportMode>('one');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => run(t('run.readingBookmarks'), async () => setTree(await platform.bookmarks.getTree())), [run, platform, t]);

  useEffect(() => {
    void run(t('run.checkingBookmarksPermission'), async () => {
      const has = await platform.permissions.has('bookmarks');
      setAllowed(has);
      if (has) setTree(await platform.bookmarks.getTree());
    });
  }, [run, platform, t]);

  const known = useMemo(() => new Set(cards.map((c) => normalizeUrl(c.url))), [cards]);
  const plan = useMemo(() => (tree ? planBookmarkImport(tree, mode, known) : null), [tree, mode, known]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!tree || q === '') return null;
    return flatten(tree).filter((n) => `${n.title} ${n.url}`.toLowerCase().includes(q));
  }, [tree, query]);

  const sel: Selection = {
    has: (id) => picked.has(id),
    set: (ids, on) =>
      setPicked((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
  };
  const visibleIds = useMemo(() => (tree ? (matches ? webIds(matches) : webIds(tree)) : []), [tree, matches]);
  const allTicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));
  const pickedNodes = useMemo(() => (tree ? flatten(tree).filter((n) => picked.has(n.id)) : []), [tree, picked]);

  const sendToInbox = () =>
    void run(t('run.sendingBookmarks'), async () => {
      const links = pickedNodes.map((n) => ({ title: n.title || (n.url ?? ''), url: n.url ?? '' }));
      const approved = await guard(links);
      if (!approved) return;
      const added = await saveToInbox(db, approved);
      setPicked(new Set());
      setNote(t.plural('bm.status.sent', added));
    });

  const allow = () =>
    void run(t('run.askingBookmarksPermission'), async () => {
      const granted = await platform.permissions.request('bookmarks');
      setAllowed(granted);
      if (granted) setTree(await platform.bookmarks.getTree());
    });

  const importNow = () =>
    void run(t('run.importingBookmarks'), async () => {
      if (!plan) return;
      const { cards: added } = await repo.importStructure([plan.space]);
      await repo.recordActivity('duplicates-skipped', plan.alreadySaved);
      setNote(t('bm.status.imported', { added: t.plural('count.links', added), saved: t.plural('count.links', plan.alreadySaved), space: t('inbox.bookmarksSpace') }));
    });

  const removeSaved = () => {
    if (!plan) return;
    const links = plan.removableIds.length;
    const folders = plan.emptiedFolderIds.length;
    const text = t.plural('bm.removeConfirm', links, { folders: folders > 0 ? t('bm.removeFoldersSuffix', { n: folders }) : '' });
    if (!confirm(text)) return;
    void run(t('run.removingBookmarks'), async () => {
      await platform.bookmarks.remove([...plan.removableIds, ...plan.emptiedFolderIds]);
      setNote(t.plural('bm.status.removed', links));
      setTree(await platform.bookmarks.getTree());
    });
  };

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div className={`${box} mx-auto flex max-w-xl flex-col items-start gap-3 p-6`}>
        <Star size={22} aria-hidden className="text-primary" />
        <h2 className="text-lg font-bold">{t('bm.title')}</h2>
        <p className="text-sm text-muted">{t('bm.intro')}</p>
        <PrimaryButton onClick={allow}>{t('bm.allow')}</PrimaryButton>
      </div>
    );
  }

  const total = tree ? countBookmarks(tree) : 0;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
      {plan && (
        <section aria-label={t('bm.copyToTabarium')} className={`${box} flex flex-col gap-4 p-5`}>
          <div>
            <h2 className="text-base font-bold">{t('bm.copyTitle')}</h2>
            <p className="text-sm text-muted">
              {t('bm.countInBrowser', {
                count: t.plural('count.bookmarks', total),
                importing: t.plural('count.linksNew', plan.importing),
                saved: t('count.savedAlready', { n: plan.alreadySaved }),
                notWeb: plan.notWeb > 0 ? t('bm.notWebSuffix', { n: plan.notWeb }) : '',
              })}
            </p>
          </div>
          <div role="radiogroup" aria-label={t('bm.howTo')} className="grid gap-2 md:grid-cols-2" onKeyDown={radioGroupKeyDown}>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                tabIndex={radioTab(mode === m.value)}
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${mode === m.value ? 'border-primary bg-surface-2' : 'border-line hover:bg-surface-2'}`}
              >
                <span className="text-sm font-semibold">{t(m.titleKey, { name: t('inbox.bookmarksCollection') })}</span>
                <span className="text-xs text-muted">{t(m.hintKey)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton disabled={plan.importing === 0} onClick={importNow}>
              {plan.importing === 0 ? t('bm.nothingNew') : t.plural('bm.copyNew', plan.importing)}
            </PrimaryButton>
            <SecondaryButton disabled={plan.importing > 0 || plan.removableIds.length === 0} onClick={removeSaved}>
              {t('bm.removeSaved', { n: plan.removableIds.length })}
            </SecondaryButton>
            {plan.importing > 0 && plan.removableIds.length > 0 && <span className="text-xs text-muted">{t('bm.copyFirstHint')}</span>}
          </div>
          {note && (
            <p role="status" className="text-sm font-medium text-primary">
              {note}
            </p>
          )}
        </section>
      )}

      <section aria-label={t('bm.section')} className={`${box} flex flex-col gap-3 p-4`}>
        <div className="flex items-center justify-between gap-3">
          <label className="relative w-72 max-w-full">
            <span className="sr-only">{t('bm.search')}</span>
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('bm.search')} className={`${inputClass} h-10 pl-9`} />
          </label>
          <SecondaryButton onClick={() => void load()}>{t('common.refresh')}</SecondaryButton>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allTicked} disabled={visibleIds.length === 0} onChange={(e) => sel.set(visibleIds, e.target.checked)} className={checkbox} />
            {matches ? t('common.selectAllFound') : t('common.selectAll')}
          </label>
          <PrimaryButton disabled={pickedNodes.length === 0} onClick={sendToInbox}>
            {t('bm.sendToInbox', { n: pickedNodes.length })}
          </PrimaryButton>
        </div>
        {tree === null ? null : matches ? (
          matches.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">{t('bm.noMatch')}</p>
          ) : (
            <ul>
              {matches.map((n) => (
                <BookmarkRow key={n.id} node={n} saved={n.url !== undefined && known.has(normalizeUrl(n.url))} sel={sel} />
              ))}
            </ul>
          )
        ) : (
          <Nodes nodes={tree.flatMap((r) => (r.url === undefined && r.title === '' ? (r.children ?? []) : [r]))} known={known} depth={0} sel={sel} />
        )}
      </section>
    </div>
  );
}
