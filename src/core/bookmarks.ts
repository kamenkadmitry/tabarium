import { type ImportedSpace, isWebUrl } from './formats';
import { tr } from '../i18n/runtime';
import { normalizeUrl } from './url';

/** One node of the browser's bookmark tree: a folder has `children`, a bookmark has `url`. */
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}

export const BOOKMARK_IMPORT_MODES = ['one', 'folders'] as const;
/** `one`: a single collection with every bookmark; `folders`: a collection per bookmark folder, named by its path. */
export type BookmarkImportMode = (typeof BOOKMARK_IMPORT_MODES)[number];

export const BOOKMARKS_SPACE = 'Browser bookmarks';
export const BOOKMARKS_COLLECTION = 'Bookmarks from the browser';

export interface BookmarkPlan {
  space: ImportedSpace;
  /** Bookmarks that become links. */
  importing: number;
  /** Bookmarks whose address is already in the library or appears twice in the bookmarks. */
  alreadySaved: number;
  /** Bookmarks that are not web pages (javascript:, chrome://...) and stay where they are. */
  notWeb: number;
  /** Bookmarks whose address is in the library once the import is done: the ones safe to remove from the browser. */
  removableIds: string[];
  /** Folders that are empty once `removableIds` are gone, deepest first. The top-level folders are never listed. */
  emptiedFolderIds: string[];
}

/** Counts the bookmarks (not folders) of a tree. */
export function countBookmarks(nodes: readonly BookmarkNode[]): number {
  return nodes.reduce((n, node) => n + (node.url !== undefined ? 1 : countBookmarks(node.children ?? [])), 0);
}

/**
 * Decides what an import of the bookmarks would do. `root` is what `getTree()` returns: a nameless node whose children
 * are the top-level folders ("Bookmarks bar", "Other bookmarks"). `known` holds the normalised addresses already in the library.
 */
export function planBookmarkImport(root: readonly BookmarkNode[], mode: BookmarkImportMode, known: ReadonlySet<string>): BookmarkPlan {
  const topFolders = root.flatMap((r) => (r.url === undefined && r.title === '' ? (r.children ?? []) : [r]));
  const seen = new Set(known);
  const collections: ImportedSpace['collections'] = [];
  const oneLinks: { title: string; url: string }[] = [];
  const removableIds: string[] = [];
  const emptiedFolderIds: string[] = [];
  let importing = 0;
  let alreadySaved = 0;
  let notWeb = 0;

  /** Walks a folder; returns whether nothing is left in it after the removal. */
  const walk = (folder: BookmarkNode, path: string[], depth: number): boolean => {
    const links: { title: string; url: string }[] = [];
    let empty = true;
    const subfolders: BookmarkNode[] = [];
    for (const node of folder.children ?? []) {
      if (node.url === undefined) {
        subfolders.push(node);
        continue;
      }
      if (!isWebUrl(node.url)) {
        notWeb += 1;
        empty = false;
        continue;
      }
      const key = normalizeUrl(node.url);
      if (seen.has(key)) alreadySaved += 1;
      else {
        seen.add(key);
        importing += 1;
        const link = { title: node.title || node.url, url: node.url };
        links.push(link);
        oneLinks.push(link);
      }
      removableIds.push(node.id);
    }
    if (mode === 'folders' && links.length > 0) collections.push({ title: path.join(' / '), links });
    for (const sub of subfolders) {
      if (!walk(sub, [...path, sub.title || tr()('common.untitled')], depth + 1)) empty = false;
    }
    if (empty && depth >= 1 && (folder.children?.length ?? 0) > 0) emptiedFolderIds.push(folder.id);
    return empty;
  };

  for (const top of topFolders) walk(top, [top.title || 'Bookmarks'], 0);
  if (mode === 'one' && oneLinks.length > 0) collections.push({ title: BOOKMARKS_COLLECTION, links: oneLinks });
  return { space: { name: BOOKMARKS_SPACE, collections }, importing, alreadySaved, notWeb, removableIds, emptiedFolderIds };
}
