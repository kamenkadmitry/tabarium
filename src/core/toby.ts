import { z } from 'zod';
import type { Backup } from './backup';
import { type ImportedCollection, type ImportedLink, type ImportedSpace, isWebUrl } from './formats';

/**
 * Reading and writing the interchange files that Toby users already have: the JSON export (workspace
 * "v4" and the older flat "v1-v3" layouts), the plain-text export and the flat HTML export. Only the
 * documented shape of those files is used; nothing here depends on any Toby code or service.
 */

const str = z.string().catch('');

const TobyCard = z
  .object({
    title: str,
    url: z.string().min(1),
    favIconUrl: str,
    favIconURL: str,
    customTitle: str,
    customDescription: str,
  })
  .transform((c): ImportedLink => ({
    title: c.title,
    url: c.url,
    favIconUrl: c.favIconUrl || c.favIconURL || null,
    customTitle: c.customTitle || null,
    note: c.customDescription || null,
  }));

const cards = z.array(z.unknown()).catch([]).transform((items) =>
  items.flatMap((item) => {
    const parsed = TobyCard.safeParse(item);
    return parsed.success && isWebUrl(parsed.data.url) ? [parsed.data] : [];
  }),
);

const TobyLabel = z.object({ title: str, color: str });

const FlatExport = z.object({
  lists: z.array(
    z.object({
      title: str,
      cards,
      labels: z.array(TobyLabel).catch([]),
    }),
  ),
});

const WorkspaceExport = z.object({
  version: z.literal(4),
  labels: z.record(z.string(), TobyLabel).catch({}),
  groups: z.array(
    z.object({
      name: str,
      type: str,
      lists: z
        .array(z.object({ title: str, labelIds: z.array(z.string()).catch([]), cards }))
        .catch([]),
    }),
  ),
});

const notEmptyTag = (t: { title: string; color: string }) => t.title !== '' || t.color !== '';

/** Parses a Toby JSON export (workspace v4 or flat v1-v3). Throws a descriptive error on anything else. */
export function parseTobyJson(json: string): ImportedSpace[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Not valid JSON');
  }
  if (typeof data !== 'object' || data === null) throw new Error('Not a Toby export object');

  const workspace = WorkspaceExport.safeParse(data);
  if (workspace.success) {
    const { groups, labels } = workspace.data;
    return groups.map((g) => ({
      name: g.name || 'Imported',
      collections: g.lists.map((l) => ({
        title: l.title,
        links: l.cards,
        tags: l.labelIds.flatMap((id) => {
          const label = Object.hasOwn(labels, id) ? labels[id] : undefined;
          return label && notEmptyTag(label) ? [{ title: label.title, color: label.color }] : [];
        }),
      })),
    }));
  }

  const flat = FlatExport.safeParse(data);
  if (flat.success) {
    return [
      {
        name: 'Imported',
        collections: flat.data.lists.map((l) => ({
          title: l.title,
          links: l.cards,
          tags: l.labels.filter(notEmptyTag),
        })),
      },
    ];
  }

  if ((data as { version?: unknown }).version !== undefined && (data as { version?: unknown }).version !== 4) {
    throw new Error(`Unsupported Toby export version ${String((data as { version?: unknown }).version)}`);
  }
  throw new Error('Not a Toby export: expected a "lists" array (v1-v3) or "groups" (v4)');
}

/** Parses the Toby plain-text export (blocks separated by blank lines: a title line followed by URLs). */
export function parseTobyText(text: string): ImportedSpace[] {
  if (/^VERSION=4$/m.test(text)) {
    throw new Error('This is a v4 workspace text export; export it as JSON to keep the structure');
  }
  const collections: ImportedCollection[] = [];
  let title: string | null = null;
  let links: ImportedLink[] = [];
  const flush = () => {
    if (links.length > 0) collections.push({ title: title ?? 'Imported', links });
    title = null;
    links = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') flush();
    else if (isWebUrl(line)) links.push({ title: new URL(line).hostname.replace(/^www\./, ''), url: line });
    else if (title === null) title = line;
  }
  flush();
  return collections.length > 0 ? [{ name: 'Imported', collections }] : [];
}

/** Parses the flat Toby HTML export (a heading per collection followed by its links). */
export function parseTobyHtml(html: string): ImportedSpace[] {
  if (/Version:\s*4/.test(html)) {
    throw new Error('This is a v4 workspace HTML export; export it as JSON to keep the structure');
  }
  const collections: ImportedCollection[] = [];
  let current: ImportedCollection = { title: 'Imported', links: [] };
  const flush = () => {
    if (current.links.length > 0) collections.push(current);
  };
  for (const m of html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (m[1] !== undefined) {
      flush();
      current = { title: m[1].replace(/<[^>]*>/g, '').trim() || 'Imported', links: [] };
    } else {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[2] ?? '');
      const url = (href?.[1] ?? href?.[2] ?? '').replace(/&amp;/g, '&').trim();
      if (isWebUrl(url)) current.links.push({ title: (m[3] ?? '').replace(/<[^>]*>/g, '').trim() || url, url });
    }
  }
  flush();
  return collections.length > 0 ? [{ name: 'Imported', collections }] : [];
}

/** Picks the parser from the file name. */
export function parseTobyFile(filename: string, content: string): ImportedSpace[] {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'json') return parseTobyJson(content);
  if (ext === 'txt') return parseTobyText(content);
  if (ext === 'html' || ext === 'htm') return parseTobyHtml(content);
  throw new Error(`Unsupported file type: .${ext ?? ''}`);
}

/** Writes the library in the Toby workspace JSON layout (v4) so it can be imported there. */
export function toTobyJson(b: Backup): string {
  const tagIdByTag = new Map(b.tags.map((t) => [t.id, t]));
  const labels: Record<string, { title: string; color: string }> = {};
  const byPosition = <T extends { position: number }>(items: readonly T[]) => [...items].sort((a, c) => a.position - c.position);
  const groups = byPosition(b.spaces).map((space) => ({
    name: space.name,
    type: 'public',
    lists: byPosition(b.collections.filter((c) => c.spaceId === space.id)).map((col) => {
      const labelIds = col.tagIds.flatMap((id) => {
        const tag = tagIdByTag.get(id);
        if (!tag) return [];
        labels[id] = { title: tag.title, color: tag.color };
        return [id];
      });
      return {
        title: col.title,
        labelIds,
        cards: byPosition(b.cards.filter((c) => c.collectionId === col.id)).map((card) => ({
          title: card.title,
          url: card.url,
          favIconUrl: card.favIconUrl ?? '',
          customTitle: card.customTitle ?? '',
          customDescription: card.note ?? '',
          description: '',
        })),
      };
    }),
  }));
  return JSON.stringify({ version: 4, groups, labels }, null, 2);
}
