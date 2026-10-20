import { describe, expect, it } from 'vitest';
import { filterOpenTabs, segmentTabs } from '../src/ui/openTabsModel';
import type { OpenTab, OpenWindow } from '../src/platform/ports';

const tab = (id: number, title: string, groupId?: number): OpenTab => ({
  id,
  title,
  url: `https://${title.toLowerCase().replace(/\s+/g, '-')}.dev/`,
  favIconUrl: null,
  ...(groupId !== undefined && { groupId }),
});

describe('segmentTabs', () => {
  it('splits a tab strip into group and ungrouped runs in order', () => {
    const w = {
      tabs: [tab(1, 'A'), tab(2, 'B', 5), tab(3, 'C', 5), tab(4, 'D'), tab(5, 'E', 6), tab(6, 'F')],
      groups: [
        { id: 5, title: 'Docs', color: 'blue' },
        { id: 6, title: 'News', color: 'red' },
      ],
    };
    const runs = segmentTabs(w);
    expect(runs.map((r) => [r.group?.title ?? null, r.tabs.map((t) => t.id)])).toEqual([
      [null, [1]],
      ['Docs', [2, 3]],
      [null, [4]],
      ['News', [5]],
      [null, [6]],
    ]);
  });

  it('keeps tabs of an undescribed group together instead of dropping them', () => {
    const runs = segmentTabs({ tabs: [tab(1, 'A', 9), tab(2, 'B', 9)], groups: [] });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.group).toEqual({ id: 9, title: '', color: 'grey' });
    expect(runs[0]?.tabs).toHaveLength(2);
  });

  it('handles empty windows', () => {
    expect(segmentTabs({ tabs: [], groups: [] })).toEqual([]);
  });
});

describe('filterOpenTabs', () => {
  const windows: OpenWindow[] = [
    { id: 1, current: true, groups: [], tabs: [tab(1, 'Rust Book'), tab(2, 'Tailwind Docs')] },
    { id: 2, current: false, groups: [], tabs: [tab(3, 'Rust by Example')] },
  ];
  it('searches title and address across windows, case-insensitively', () => {
    expect(filterOpenTabs(windows, 'RUST').map((t) => t.id)).toEqual([1, 3]);
    expect(filterOpenTabs(windows, 'tailwind-docs.dev').map((t) => t.id)).toEqual([2]);
  });
  it('returns nothing for an empty query', () => {
    expect(filterOpenTabs(windows, '   ')).toEqual([]);
  });
});
