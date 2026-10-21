import { describe, expect, it } from 'vitest';
import { type BookmarkNode, BOOKMARKS_COLLECTION, countBookmarks, planBookmarkImport } from '../src/core/bookmarks';
import { normalizeUrl } from '../src/core/url';

const link = (id: string, url: string, title = id): BookmarkNode => ({ id, title, url });
const folder = (id: string, title: string, children: BookmarkNode[]): BookmarkNode => ({ id, title, children });

const tree: BookmarkNode[] = [
  folder('0', '', [
    folder('1', 'Bookmarks bar', [
      link('a', 'https://a.dev/'),
      link('b', 'https://b.dev/x'),
      link('js', 'javascript:alert(1)'),
      folder('f1', 'Dev', [link('c', 'https://c.dev/'), link('a2', 'https://a.dev')]),
      folder('f2', 'Reading', [link('d', 'https://d.dev/')]),
      folder('f3', 'Already empty', []),
    ]),
    folder('2', 'Other bookmarks', [link('e', 'https://e.dev/')]),
  ]),
];

describe('planBookmarkImport', () => {
  it('puts everything in one collection and skips what the library already has', () => {
    const plan = planBookmarkImport(tree, 'one', new Set([normalizeUrl('https://b.dev/x')]));
    expect(plan.space.collections).toHaveLength(1);
    expect(plan.space.collections[0]?.title).toBe(BOOKMARKS_COLLECTION);
    expect(plan.space.collections[0]?.links.map((l) => l.url)).toEqual(['https://a.dev/', 'https://c.dev/', 'https://d.dev/', 'https://e.dev/']);
    expect(plan).toMatchObject({ importing: 4, alreadySaved: 2, notWeb: 1 }); // b is saved, a2 repeats a
    expect(plan.removableIds.sort()).toEqual(['a', 'a2', 'b', 'c', 'd', 'e']);
  });

  it('keeps the folders as collections named by their path', () => {
    const plan = planBookmarkImport(tree, 'folders', new Set());
    expect(plan.space.collections.map((c) => c.title)).toEqual(['Bookmarks bar', 'Bookmarks bar / Dev', 'Bookmarks bar / Reading', 'Other bookmarks']);
    expect(countBookmarks(tree)).toBe(7);
  });

  it('lists the folders that end up empty, but never top-level ones, folders with kept bookmarks or folders that were empty', () => {
    const plan = planBookmarkImport(tree, 'one', new Set());
    expect(plan.emptiedFolderIds.sort()).toEqual(['f1', 'f2']); // the bar keeps the javascript: bookmark and f3
  });
});
