import { beforeEach, describe, expect, it } from 'vitest';
import { TabariumDB } from '../src/core/db';
import { describeCards } from '../src/core/describe';
import { fetchPageInfo, parsePageInfo } from '../src/core/pageInfo';
import { Repository } from '../src/core/repo';

describe('parsePageInfo', () => {
  it('prefers the meta description, then Open Graph, then Twitter', () => {
    expect(parsePageInfo('<meta name="description" content="Plain">').description).toBe('Plain');
    expect(parsePageInfo('<meta property="og:description" content="OG">').description).toBe('OG');
    expect(parsePageInfo("<meta name='twitter:description' content='Tw'>").description).toBe('Tw');
    expect(parsePageInfo('<meta property="og:description" content="OG"><meta name="description" content="Plain">').description).toBe('Plain');
    expect(parsePageInfo('<html><head><title>x</title></head></html>')).toEqual({ description: null, heading: null });
  });

  it('decodes entities, collapses spaces and cuts long text', () => {
    const html = '<meta name="description" content="Fish &amp; chips &#8212; &#x41;  tasty\n food"><h1> A <span>big</span>  title &quot;ok&quot; </h1>';
    expect(parsePageInfo(html)).toEqual({ description: 'Fish & chips — A tasty food', heading: 'A big title "ok"' });
    expect(parsePageInfo(`<meta name="description" content="${'x'.repeat(500)}">`).description).toHaveLength(300);
  });

  it('ignores comments, scripts and styles', () => {
    const html = '<!-- <h1>no</h1> --><script>var s = "<h1>no</h1>";</script><style>h1{}</style><h1>Real</h1>';
    expect(parsePageInfo(html).heading).toBe('Real');
  });
});

describe('fetchPageInfo', () => {
  const reply = (body: BodyInit, type = 'text/html; charset=utf-8', status = 200) => async () => new Response(body, { status, headers: { 'content-type': type } });

  it('reads the page and honours the charset of the response', async () => {
    const text = new TextEncoder();
    const bytes = new Uint8Array([...text.encode('<meta name="description" content="'), 0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, ...text.encode('">')]);
    const info = await fetchPageInfo('https://a.dev/', reply(bytes, 'text/html; charset=windows-1251'));
    expect(info.description).toBe('Привет');
  });

  it('refuses non-web addresses, error pages and other file types', async () => {
    await expect(fetchPageInfo('ftp://a.dev/', reply('x'))).rejects.toThrow('Only http');
    await expect(fetchPageInfo('https://a.dev/', reply('x', 'text/html', 404))).rejects.toThrow('404');
    await expect(fetchPageInfo('https://a.dev/', reply('x', 'application/pdf'))).rejects.toThrow('not a web page');
  });
});

describe('describeCards', () => {
  let db: TabariumDB;
  let repo: Repository;
  beforeEach(() => {
    db = new TabariumDB(`test-${crypto.randomUUID()}`);
    repo = new Repository(db);
  });

  it('stores what pages say, and records pages that fail without trying them again by itself', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    const [ok, bad] = await repo.addCards(col.id, [
      { title: 'Good', url: 'https://good.dev/' },
      { title: 'Bad', url: 'https://bad.dev/' },
    ]);
    if (!ok || !bad) throw new Error('cards were not added');
    const fetchImpl = async (url: string) =>
      url.includes('good') ? new Response('<meta name="description" content="Nice"><h1>Head</h1>', { headers: { 'content-type': 'text/html' } }) : new Response('no', { status: 500 });

    const result = await describeCards(db, repo, [ok.id, bad.id], { fetchImpl });
    expect(result.read).toBe(1);
    expect(result.failed.map((f) => f.cardId)).toEqual([bad.id]);
    expect(await db.cards.get(ok.id)).toMatchObject({ description: 'Nice', heading: 'Head' });
    const failed = await db.cards.get(bad.id);
    expect(failed?.description).toBeNull();
    expect(failed?.pageInfoAt).not.toBeNull(); // tried
  });

  it('forgets what was read when the address changes', async () => {
    const space = await repo.createSpace('S');
    const col = await repo.createCollection(space.id, 'C');
    const [card] = await repo.addCards(col.id, [{ title: 'A', url: 'https://a.dev/' }]);
    if (!card) throw new Error('card was not added');
    await repo.setPageInfo(card.id, { description: 'Old', heading: null });
    await repo.updateCard(card.id, { note: 'only a note' });
    expect((await db.cards.get(card.id))?.description).toBe('Old');
    await repo.updateCard(card.id, { url: 'https://b.dev/' });
    expect(await db.cards.get(card.id)).toMatchObject({ description: null, heading: null, pageInfoAt: null });
  });
});
