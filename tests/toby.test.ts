import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup } from '../src/core/backup';
import { TabariumDB } from '../src/core/db';
import { Repository } from '../src/core/repo';
import { parseTobyFile, parseTobyHtml, parseTobyJson, parseTobyText, toTobyJson } from '../src/core/toby';

let db: TabariumDB;
let repo: Repository;

beforeEach(() => {
  db = new TabariumDB(`test-${crypto.randomUUID()}`);
  repo = new Repository(db);
});

const v4 = {
  version: 4,
  groups: [
    {
      name: 'My Collections',
      type: 'personal',
      lists: [
        {
          title: 'Research',
          labelIds: ['l1', 'missing'],
          cards: [
            { title: 'A', url: 'https://a.dev/', favIconUrl: 'data:image/webp;base64,AAA', customTitle: 'Mine', customDescription: 'a note', description: 'page text' },
            { title: 'Bad scheme', url: 'javascript:alert(1)', favIconUrl: '', customTitle: '', customDescription: '' },
            { title: 'B', url: 'https://b.dev/', favIconUrl: '', customTitle: '', customDescription: '' },
          ],
        },
      ],
    },
    { name: 'Work', type: 'public', lists: [{ title: 'Empty', labelIds: [], cards: [] }] },
  ],
  labels: { l1: { title: 'Later', color: 'orange' } },
};

describe('Toby JSON import', () => {
  it('reads the workspace (v4) layout including notes, tags and custom titles', () => {
    const spaces = parseTobyJson(JSON.stringify(v4));
    expect(spaces.map((s) => s.name)).toEqual(['My Collections', 'Work']);
    const research = spaces[0]!.collections[0]!;
    expect(research.links.map((l) => l.url)).toEqual(['https://a.dev/', 'https://b.dev/']); // unsafe scheme dropped
    expect(research.links[0]).toMatchObject({ customTitle: 'Mine', note: 'a note', favIconUrl: 'data:image/webp;base64,AAA' });
    expect(research.tags).toEqual([{ title: 'Later', color: 'orange' }]); // unknown label id ignored
  });

  it('reads the older flat (v1-v3) layout', () => {
    const flat = { lists: [{ title: 'Old', cards: [{ title: 'X', url: 'https://x.io', favIconURL: 'f', customTitle: '', customDescription: '' }], labels: [{ title: 'T', color: 'red' }] }] };
    const [space] = parseTobyJson(JSON.stringify(flat));
    expect(space?.collections[0]).toMatchObject({ title: 'Old', tags: [{ title: 'T', color: 'red' }] });
    expect(space?.collections[0]?.links[0]?.favIconUrl).toBe('f');
  });

  it('is not fooled by prototype keys in label ids', () => {
    const evil = { ...v4, groups: [{ name: 'g', type: 'public', lists: [{ title: 't', labelIds: ['__proto__', 'constructor'], cards: [] }] }], labels: {} };
    const [space] = parseTobyJson(JSON.stringify(evil));
    expect(space?.collections[0]?.tags).toEqual([]);
  });

  it('rejects other input with a clear message', () => {
    expect(() => parseTobyJson('nope')).toThrow(/Not valid JSON/);
    expect(() => parseTobyJson('[]')).toThrow(/Not a Toby export/);
    expect(() => parseTobyJson('{"version":9,"groups":[]}')).toThrow(/Unsupported Toby export version 9/);
    expect(() => parseTobyJson('{"foo":1}')).toThrow(/Not a Toby export/);
  });
});

describe('Toby TXT and HTML import', () => {
  it('reads text blocks', () => {
    const [space] = parseTobyText('Reading\nhttps://a.dev/x\nhttps://www.b.dev\n\nTools\nhttps://c.dev\n\n\nhttps://d.dev\n');
    expect(space?.collections.map((c) => c.title)).toEqual(['Reading', 'Tools', 'Imported']);
    expect(space?.collections[0]?.links.map((l) => l.title)).toEqual(['a.dev', 'b.dev']);
  });
  it('refuses v4 text and html exports with advice', () => {
    expect(() => parseTobyText('VERSION=4\nx')).toThrow(/export it as JSON/);
    expect(() => parseTobyHtml('<div class="metadata">Version: 4</div>')).toThrow(/export it as JSON/);
  });
  it('reads the flat html export', () => {
    const html = '<h3>One</h3><a href="https://a.dev/?x=1&amp;y=2">A &amp; B</a><a href="mailto:x@y.z">no</a><h3>Two</h3><a href="https://b.dev">B</a>';
    const [space] = parseTobyHtml(html);
    expect(space?.collections.map((c) => [c.title, c.links.map((l) => l.url)])).toEqual([
      ['One', ['https://a.dev/?x=1&y=2']],
      ['Two', ['https://b.dev']],
    ]);
  });
  it('dispatches on the file extension', () => {
    expect(parseTobyFile('x.json', JSON.stringify(v4))).toHaveLength(2);
    expect(parseTobyFile('x.TXT', 'T\nhttps://a.dev')).toHaveLength(1);
    expect(() => parseTobyFile('x.pdf', '')).toThrow(/Unsupported file type/);
  });
});

describe('Toby-compatible round trip', () => {
  it('import then export keeps structure, notes, custom titles and tags', async () => {
    await repo.importStructure(parseTobyJson(JSON.stringify(v4)));
    expect(await db.tags.count()).toBe(1);

    const exported = JSON.parse(toTobyJson(await exportBackup(db)));
    expect(exported.version).toBe(4);
    expect(exported.groups.map((g: { name: string }) => g.name)).toEqual(['My Collections', 'Work']);
    const list = exported.groups[0].lists[0];
    expect(list.cards[0]).toMatchObject({ url: 'https://a.dev/', customTitle: 'Mine', customDescription: 'a note' });
    expect(list.labelIds).toHaveLength(1);
    expect(exported.labels[list.labelIds[0]]).toEqual({ title: 'Later', color: 'orange' });

    // The exported file is itself readable by the importer.
    const again = parseTobyJson(JSON.stringify(exported));
    expect(again[0]?.collections[0]?.links).toHaveLength(2);
  });

  it('reuses existing tags by title instead of duplicating them', async () => {
    await repo.importStructure(parseTobyJson(JSON.stringify(v4)));
    await repo.importStructure(parseTobyJson(JSON.stringify(v4)));
    expect(await db.tags.count()).toBe(1);
  });
});
