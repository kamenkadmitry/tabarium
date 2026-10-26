import type { Backup } from './backup';
import { tr } from '../i18n/runtime';
import { normalizeUrl } from './url';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const byPosition = <T extends { position: number }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.position - b.position);

/** Netscape bookmark file: spaces and collections become nested folders. Importable by every major browser. */
export function toBookmarksHtml(b: Backup): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  for (const space of byPosition(b.spaces)) {
    lines.push(`  <DT><H3>${escapeHtml(space.name)}</H3>`, '  <DL><p>');
    for (const col of byPosition(b.collections.filter((c) => c.spaceId === space.id))) {
      lines.push(`    <DT><H3>${escapeHtml(col.title)}</H3>`, '    <DL><p>');
      for (const card of byPosition(b.cards.filter((c) => c.collectionId === col.id))) {
        const added = Math.floor(card.createdAt / 1000);
        lines.push(
          `      <DT><A HREF="${escapeHtml(card.url)}" ADD_DATE="${added}">${escapeHtml(card.customTitle ?? card.title)}</A>`,
        );
      }
      lines.push('    </DL><p>');
    }
    lines.push('  </DL><p>');
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

/** Plain-text export: one block per collection, one "title - url" line per tab. */
export function toPlainText(b: Backup): string {
  const out: string[] = [];
  for (const space of byPosition(b.spaces)) {
    for (const col of byPosition(b.collections.filter((c) => c.spaceId === space.id))) {
      out.push(`${space.name} / ${col.title}`);
      for (const card of byPosition(b.cards.filter((c) => c.collectionId === col.id))) {
        out.push(`  ${card.customTitle ?? card.title} - ${card.url}`);
        if (card.note) out.push(`    ${card.note.replace(/\n/g, '\n    ')}`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}

export interface ImportedTag {
  title: string;
  color: string;
}
export interface ImportedLink {
  title: string;
  url: string;
  favIconUrl?: string | null;
  customTitle?: string | null;
  note?: string | null;
  tags?: ImportedTag[];
  /** Free-form #hashtag names (without the #). */
  hashtags?: string[];
  starred?: boolean;
}
export interface ImportedCollection {
  title: string;
  links: ImportedLink[];
  tags?: ImportedTag[];
}
export interface ImportedSpace {
  name: string;
  collections: ImportedCollection[];
}

export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith('#')) {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

interface Folder {
  title: string;
  links: ImportedLink[];
  children: Folder[];
}

/** Tokenises the Netscape format (<DL>, <H3>, <A>) into a folder tree without relying on an HTML parser. */
function parseFolderTree(html: string): Folder {
  const token = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<(\/?)dl\b[^>]*>/gi;
  const root: Folder = { title: '', links: [], children: [] };
  const stack: Folder[] = [];
  let pendingTitle = '';
  let sawList = false;
  for (const m of html.matchAll(token)) {
    if (m[1] !== undefined) {
      pendingTitle = decodeEntities(m[1].replace(/<[^>]*>/g, '')).trim();
    } else if (m[3] !== undefined) {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[2] ?? '');
      const url = decodeEntities(href?.[1] ?? href?.[2] ?? '').trim();
      const top = stack[stack.length - 1];
      if (top && isWebUrl(url)) {
        top.links.push({ title: decodeEntities(m[3].replace(/<[^>]*>/g, '')).trim() || url, url });
      }
    } else if (m[4] === '') {
      sawList = true;
      const folder: Folder = stack.length === 0 ? root : { title: pendingTitle, links: [], children: [] };
      stack[stack.length - 1]?.children.push(folder);
      stack.push(folder);
      pendingTitle = '';
    } else {
      stack.pop();
    }
  }
  if (!sawList) throw new Error(tr()('err.notBookmarksFile'));
  return root;
}

const allLinks = (f: Folder): ImportedLink[] => [...f.links, ...f.children.flatMap(allLinks)];

/**
 * Parses a Netscape bookmark file. A top-level folder that contains sub-folders becomes a space and its
 * sub-folders collections (deeper levels merge into their collection); a folder that holds links directly
 * becomes a collection in the "Imported" space.
 */
export function parseBookmarksHtml(html: string): ImportedSpace[] {
  const root = parseFolderTree(html);
  const imported = new Map<string, ImportedSpace>();
  const spaceNamed = (name: string) => {
    const existing = imported.get(name);
    if (existing) return existing;
    const created: ImportedSpace = { name, collections: [] };
    imported.set(name, created);
    return created;
  };

  if (root.links.length > 0) spaceNamed(tr()('common.imported')).collections.push({ title: tr()('common.unsorted'), links: root.links });
  for (const top of root.children) {
    if (top.children.length === 0) {
      if (top.links.length > 0) spaceNamed(tr()('common.imported')).collections.push({ title: top.title, links: top.links });
      continue;
    }
    const space = spaceNamed(top.title || tr()('common.imported'));
    if (top.links.length > 0) space.collections.push({ title: tr()('common.unsorted'), links: top.links });
    for (const sub of top.children) {
      const links = allLinks(sub);
      if (links.length > 0) space.collections.push({ title: sub.title, links });
    }
  }
  return [...imported.values()];
}

/** Drops links that repeat a normalised URL within the same collection. */
export function dedupeLinks(links: readonly ImportedLink[]): ImportedLink[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const key = normalizeUrl(l.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
