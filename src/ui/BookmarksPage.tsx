import { ChevronRight, Folder, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type BookmarkImportMode, type BookmarkNode, BOOKMARKS_COLLECTION, BOOKMARKS_SPACE, countBookmarks, planBookmarkImport } from '../core/bookmarks';
import { repo } from '../core/instance';
import type { Card } from '../core/types';
import { normalizeUrl } from '../core/url';
import { usePlatform } from '../platform/context';
import { hostOf, PageFavicon } from './CardRow';
import { inputClass, PrimaryButton, SecondaryButton } from './Dialog';

const box = 'rounded-2xl border border-line bg-surface';

const MODES: { value: BookmarkImportMode; title: string; hint: string }[] = [
  { value: 'one', title: `One collection “${BOOKMARKS_COLLECTION}”`, hint: 'All new bookmarks together, in the order of the browser.' },
  { value: 'folders', title: 'Keep the folders', hint: 'One collection per bookmark folder, named by its path.' },
];

function BookmarkRow({ node, saved }: { node: BookmarkNode; saved: boolean }) {
  const url = node.url ?? '';
  return (
    <li className="flex min-h-10 items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-2">
      <PageFavicon url={url} favIconUrl={null} size={18} />
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{node.title || url}</span>
        <span className="block truncate text-xs text-muted">{hostOf(url)}</span>
      </a>
      {saved && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-primary">In Tabarium</span>}
    </li>
  );
}

function FolderNode({ node, known, depth }: { node: BookmarkNode; known: ReadonlySet<string>; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const count = countBookmarks(node.children ?? []);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-2"
      >
        <ChevronRight size={16} aria-hidden className={`shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        <Folder size={16} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{node.title || 'Untitled'}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{count}</span>
      </button>
      {open && <Nodes nodes={node.children ?? []} known={known} depth={depth + 1} />}
    </li>
  );
}

function Nodes({ nodes, known, depth }: { nodes: readonly BookmarkNode[]; known: ReadonlySet<string>; depth: number }) {
  return (
    <ul className={depth > 0 ? 'ml-4 border-l border-line pl-2' : ''}>
      {nodes.map((n) =>
        n.url === undefined ? (
          <FolderNode key={n.id} node={n} known={known} depth={depth} />
        ) : (
          <BookmarkRow key={n.id} node={n} saved={known.has(normalizeUrl(n.url))} />
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
  const platform = usePlatform();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tree, setTree] = useState<BookmarkNode[] | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<BookmarkImportMode>('one');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => run('Reading the bookmarks', async () => setTree(await platform.bookmarks.getTree())), [run, platform]);

  useEffect(() => {
    void run('Checking the bookmarks permission', async () => {
      const has = await platform.permissions.has('bookmarks');
      setAllowed(has);
      if (has) setTree(await platform.bookmarks.getTree());
    });
  }, [run, platform]);

  const known = useMemo(() => new Set(cards.map((c) => normalizeUrl(c.url))), [cards]);
  const plan = useMemo(() => (tree ? planBookmarkImport(tree, mode, known) : null), [tree, mode, known]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!tree || q === '') return null;
    return flatten(tree).filter((n) => `${n.title} ${n.url}`.toLowerCase().includes(q));
  }, [tree, query]);

  const allow = () =>
    void run('Asking for the bookmarks permission', async () => {
      const granted = await platform.permissions.request('bookmarks');
      setAllowed(granted);
      if (granted) setTree(await platform.bookmarks.getTree());
    });

  const importNow = () =>
    void run('Importing the bookmarks', async () => {
      if (!plan) return;
      const { cards: added } = await repo.importStructure([plan.space]);
      await repo.recordActivity('duplicates-skipped', plan.alreadySaved);
      setNote(`Imported ${added} link${added === 1 ? '' : 's'} into “${BOOKMARKS_SPACE}”. ${plan.alreadySaved} were saved already and were not added again.`);
    });

  const removeSaved = () => {
    if (!plan) return;
    const links = plan.removableIds.length;
    const folders = plan.emptiedFolderIds.length;
    const text = `Remove ${links} bookmark${links === 1 ? '' : 's'}${folders > 0 ? ` and ${folders} emptied folder${folders === 1 ? '' : 's'}` : ''} from the browser? Every one of them is saved in Tabarium. This cannot be undone.`;
    if (!confirm(text)) return;
    void run('Removing the bookmarks', async () => {
      await platform.bookmarks.remove([...plan.removableIds, ...plan.emptiedFolderIds]);
      setNote(`Removed ${links} bookmark${links === 1 ? '' : 's'} from the browser.`);
      setTree(await platform.bookmarks.getTree());
    });
  };

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div className={`${box} mx-auto flex max-w-xl flex-col items-start gap-3 p-6`}>
        <Star size={22} aria-hidden className="text-primary" />
        <h2 className="text-lg font-bold">Your browser bookmarks</h2>
        <p className="text-sm text-muted">
          Tabarium can show the bookmarks of this browser and copy them into your library, so the bookmarks bar can stay empty. Nothing is
          changed in the browser unless you ask for it, and nothing leaves your computer.
        </p>
        <PrimaryButton onClick={allow}>Allow access to bookmarks</PrimaryButton>
      </div>
    );
  }

  const total = tree ? countBookmarks(tree) : 0;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
      {plan && (
        <section aria-label="Copy to Tabarium" className={`${box} flex flex-col gap-4 p-5`}>
          <div>
            <h2 className="text-base font-bold">Copy the bookmarks into Tabarium</h2>
            <p className="text-sm text-muted">
              {total} bookmark{total === 1 ? '' : 's'} in the browser: {plan.importing} new, {plan.alreadySaved} already in the library
              {plan.notWeb > 0 ? `, ${plan.notWeb} that are not web pages stay as they are` : ''}.
            </p>
          </div>
          <div role="radiogroup" aria-label="How to copy" className="grid gap-2 md:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${mode === m.value ? 'border-primary bg-surface-2' : 'border-line hover:bg-surface-2'}`}
              >
                <span className="text-sm font-semibold">{m.title}</span>
                <span className="text-xs text-muted">{m.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton disabled={plan.importing === 0} onClick={importNow}>
              {plan.importing === 0 ? 'Nothing new to copy' : `Copy ${plan.importing} new link${plan.importing === 1 ? '' : 's'}`}
            </PrimaryButton>
            <SecondaryButton disabled={plan.importing > 0 || plan.removableIds.length === 0} onClick={removeSaved}>
              Remove {plan.removableIds.length} saved from the browser…
            </SecondaryButton>
            {plan.importing > 0 && plan.removableIds.length > 0 && <span className="text-xs text-muted">Copy the new ones first, then the bookmarks can be removed.</span>}
          </div>
          {note && (
            <p role="status" className="text-sm font-medium text-primary">
              {note}
            </p>
          )}
        </section>
      )}

      <section aria-label="Browser bookmarks" className={`${box} flex flex-col gap-3 p-4`}>
        <div className="flex items-center justify-between gap-3">
          <label className="relative w-72 max-w-full">
            <span className="sr-only">Search the bookmarks</span>
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the bookmarks" className={`${inputClass} h-10 pl-9`} />
          </label>
          <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
        </div>
        {tree === null ? null : matches ? (
          matches.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">No bookmark matches.</p>
          ) : (
            <ul>
              {matches.map((n) => (
                <BookmarkRow key={n.id} node={n} saved={n.url !== undefined && known.has(normalizeUrl(n.url))} />
              ))}
            </ul>
          )
        ) : (
          <Nodes nodes={tree.flatMap((r) => (r.url === undefined && r.title === '' ? (r.children ?? []) : [r]))} known={known} depth={0} />
        )}
      </section>
    </div>
  );
}
