import { describe, expect, it } from 'vitest';
import { parseDraggedLinks } from '../src/ui/dnd';

describe('links dragged from the side panel', () => {
  it('reads valid links and fills in a missing title', () => {
    const links = parseDraggedLinks(JSON.stringify([{ title: 'A', url: 'https://a.dev/', favIconUrl: 'https://a.dev/i.png' }, { url: 'http://b.dev/' }]));
    expect(links).toEqual([
      { title: 'A', url: 'https://a.dev/', favIconUrl: 'https://a.dev/i.png' },
      { title: 'http://b.dev/', url: 'http://b.dev/', favIconUrl: null },
    ]);
  });

  it('rejects data that is not a list of web links', () => {
    expect(() => parseDraggedLinks('not json')).toThrow();
    expect(() => parseDraggedLinks('[]')).toThrow('no links');
    expect(() => parseDraggedLinks(JSON.stringify([{ url: 'javascript:alert(1)' }]))).toThrow('valid web address');
    expect(() => parseDraggedLinks(JSON.stringify([{ title: 'x' }]))).toThrow('valid web address');
  });
});
