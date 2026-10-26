import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { looksLikeLinkwarden, parseLinkwarden } from '../src/core/linkwarden';
import { Repository } from '../src/core/repo';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

const exportFile = {
  name: 'Liwia Nowak',
  collectionOrder: [30, 10],
  collections: [
    {
      id: 10,
      name: 'Second',
      parentId: null,
      links: [
        {
          name: 'Page A',
          url: 'https://a.dev/',
          description: 'note for A',
          tags: [{ name: 'Soft' }, { name: '  ' }, { name: 'Tools' }],
        },
        { name: '', url: 'https://b.dev/', description: null, tags: [] },
        { name: 'Bad', url: 'javascript:alert(1)', description: '', tags: [] },
      ],
    },
    {
      id: 30,
      name: 'First',
      parentId: null,
      links: [{ name: 'Pinned one', url: 'https://pin.dev/', description: 'd', tags: [] }],
    },
    {
      id: 40,
      name: 'Nested',
      parentId: 10,
      links: [{ name: 'Deep', url: 'https://deep.dev/', description: null, tags: [] }],
    },
    { id: 50, name: 'Empty', parentId: null, links: [] },
  ],
  links: [{ name: 'Loose', url: 'https://loose.dev/', description: null, tags: [] }],
  pinnedLinks: [{ id: 1, name: 'Pinned one', url: 'https://pin.dev/', collectionId: 30 }],
};

const json = JSON.stringify(exportFile);

describe('parseLinkwarden', () => {
  it('maps collections in collectionOrder, links with notes and tags', () => {
    const [space] = parseLinkwarden(json);
    expect(space?.name).toBe('Linkwarden');
    const titles = space?.collections.map((c) => c.title);
    expect(titles).toEqual(['First', 'Second', 'Second / Nested', 'Empty', 'Unsorted']);

    const second = space?.collections[1];
    expect(second?.links.map((l) => l.url)).toEqual(['https://a.dev/', 'https://b.dev/']);
    expect(second?.links[0]).toMatchObject({
      title: 'Page A',
      note: 'note for A',
      tags: [{ title: 'Soft', color: '#0d9488' }, { title: 'Tools', color: '#0d9488' }],
    });
    // An empty name falls back to the hostname.
    expect(second?.links[1]?.title).toBe('b.dev');
  });

  it('marks pinned links starred and collects loose links under Unsorted', () => {
    const [space] = parseLinkwarden(json);
    expect(space?.collections[0]?.links[0]?.starred).toBe(true);
    const unsorted = space?.collections.at(-1);
    expect(unsorted?.links[0]?.url).toBe('https://loose.dev/');
  });

  it('detects the format and rejects other JSON shapes', () => {
    expect(looksLikeLinkwarden(json)).toBe(true);
    expect(looksLikeLinkwarden('{"app":"tabarium","version":1}')).toBe(false);
    expect(looksLikeLinkwarden('{"lists":[{"title":"x","cards":[]}]}')).toBe(false);
    expect(looksLikeLinkwarden('not json')).toBe(false);
  });

  it('throws localized errors on garbage', () => {
    expect(() => parseLinkwarden('hello')).toThrow();
    expect(() => parseLinkwarden('{"version":4,"groups":[]}')).toThrow(/Linkwarden/);
    expect(parseLinkwarden('{"collections":[]}')).toEqual([]);
  });
});

describe('importing a Linkwarden export', () => {
  it('creates the space, collections, cards with notes, tags and stars', async () => {
    const result = await repo.importStructure(parseLinkwarden(json));
    expect(result).toEqual({ collections: 5, cards: 5 });
    expect((await db.spaces.toArray()).map((s) => s.name)).toContain('Linkwarden');

    const cards = await db.cards.toArray();
    const a = cards.find((c) => c.url === 'https://a.dev/');
    expect(a?.note).toBe('note for A');
    const tagTitles = (await db.tags.toArray()).filter((t) => a?.tagIds.includes(t.id)).map((t) => t.title);
    expect(tagTitles.sort()).toEqual(['Soft', 'Tools']);
    expect(cards.find((c) => c.url === 'https://pin.dev/')?.starred).toBe(true);
  });
});
