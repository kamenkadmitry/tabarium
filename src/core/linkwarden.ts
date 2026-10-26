import { z } from 'zod';
import { tr } from '../i18n/runtime';
import { type ImportedCollection, type ImportedLink, type ImportedSpace, isWebUrl } from './formats';

/** Linkwarden JSON export: a user record with `collections[]`, each holding `links[]`. */
const LwTag = z.looseObject({ name: z.string() });
const LwLink = z.looseObject({
  name: z.string().nullish(),
  url: z.string().nullish(),
  description: z.string().nullish(),
  tags: z.array(LwTag).nullish(),
});
const LwCollection = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  parentId: z.number().nullish(),
  links: z.array(LwLink).nullish(),
});
const LwExport = z.looseObject({
  collections: z.array(LwCollection),
  collectionOrder: z.array(z.number()).nullish(),
  /** Links outside any collection. */
  links: z.array(LwLink).nullish(),
  /** Full link objects the user pinned in the UI. */
  pinnedLinks: z.array(LwLink).nullish(),
});

/** Structural check used by auto-detect: distinguishes a Linkwarden export from Toby and our backup. */
export function looksLikeLinkwarden(text: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  return LwExport.safeParse(data).success;
}

const toLink = (link: z.infer<typeof LwLink>, pinned: ReadonlySet<string>): ImportedLink | null => {
  const url = link.url?.trim();
  if (!url || !isWebUrl(url)) return null;
  const tags = (link.tags ?? [])
    .map((tag) => ({ title: tag.name.trim(), color: '#0d9488' }))
    .filter((tag) => tag.title !== '');
  const note = link.description?.trim();
  let title = link.name?.trim() ?? '';
  if (title === '')
    try {
      title = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      title = url;
    }
  return {
    title,
    url,
    note: note ? note : null,
    tags: tags.length > 0 ? tags : undefined,
    starred: pinned.has(url) || undefined,
  };
};

/**
 * Parses a Linkwarden JSON export into one space named "Linkwarden".
 * Nested collections are flattened as "Parent / Child"; collection order follows `collectionOrder`.
 */
export function parseLinkwarden(json: string): ImportedSpace[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(tr()('err.notJson'));
  }
  const parsed = LwExport.safeParse(data);
  if (!parsed.success) throw new Error(tr()('err.linkwardenStructure'));

  const pinned = new Set(
    (parsed.data.pinnedLinks ?? []).map((l) => l.url?.trim()).filter((u): u is string => !!u),
  );
  const order = new Map((parsed.data.collectionOrder ?? []).map((id, i) => [id, i]));

  const byId = new Map(parsed.data.collections.map((c) => [c.id, c]));
  const roots = parsed.data.collections
    .filter((c) => c.parentId == null || !byId.has(c.parentId))
    .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));

  const collections: ImportedCollection[] = [];
  const visit = (col: z.infer<typeof LwCollection>, prefix: string) => {
    const title = `${prefix}${col.name?.trim() || tr()('common.untitled')}`;
    const links = (col.links ?? []).map((l) => toLink(l, pinned)).filter((l): l is ImportedLink => l !== null);
    collections.push({ title, links });
    for (const child of parsed.data.collections
      .filter((c) => c.parentId === col.id)
      .sort((a, b) => a.id - b.id)) {
      visit(child, `${title} / `);
    }
  };
  for (const col of roots) visit(col, '');

  const loose = (parsed.data.links ?? [])
    .map((l) => toLink(l, pinned))
    .filter((l): l is ImportedLink => l !== null);
  if (loose.length > 0) collections.push({ title: tr()('common.unsorted'), links: loose });

  return collections.length > 0 ? [{ name: 'Linkwarden', collections }] : [];
}
