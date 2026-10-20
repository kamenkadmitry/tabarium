import type { TabariumDB } from '../core/db';
import { Repository } from '../core/repo';

interface DemoCollection {
  title: string;
  color: string | null;
  cards: [title: string, url: string][];
}

const DEMO: Record<string, DemoCollection[]> = {
  Work: [
    {
      title: 'Sprint 42 research',
      color: '#0d9488',
      cards: [
        ['Pull request #1284 · api/billing', 'https://github.com/acme/api/pull/1284'],
        ['Q4 roadmap', 'https://notion.so/acme/q4-roadmap'],
        ['Error rates dashboard', 'https://grafana.acme.dev/d/errors'],
        ['Design review thread', 'https://figma.com/file/design-review'],
      ],
    },
    {
      title: 'Reading list',
      color: '#ea580c',
      cards: [
        ['Local-first software', 'https://www.inkandswitch.com/local-first/'],
        ['IndexedDB best practices', 'https://web.dev/articles/indexeddb-best-practices'],
        ['Designing Data-Intensive Applications', 'https://dataintensive.net/'],
      ],
    },
    {
      title: 'Tools',
      color: null,
      cards: [
        ['Excalidraw', 'https://excalidraw.com/'],
        ['Regex101', 'https://regex101.com/'],
        ['Can I use', 'https://caniuse.com/'],
        ['JSON Crack', 'https://jsoncrack.com/'],
        ['Squoosh', 'https://squoosh.app/'],
      ],
    },
  ],
  Travel: [
    {
      title: 'Lisbon trip',
      color: '#6366f1',
      cards: [
        ['Alfama walking route', 'https://maps.example.com/alfama'],
        ['Tram 28 timetable', 'https://carris.pt/tram-28'],
      ],
    },
  ],
  Learning: [
    {
      title: 'Rust basics',
      color: '#a855f7',
      cards: [
        ['The Rust Book', 'https://doc.rust-lang.org/book/'],
        ['Rustlings exercises', 'https://github.com/rust-lang/rustlings'],
        ['Rust by example', 'https://doc.rust-lang.org/rust-by-example/'],
      ],
    },
  ],
};

/** Fills an empty database with demo content so the UI can be reviewed. Dev-only. */
export async function seedDemo(db: TabariumDB): Promise<void> {
  if ((await db.spaces.count()) > 0) return;
  const repo = new Repository(db);
  for (const [spaceName, collections] of Object.entries(DEMO)) {
    const space = await repo.createSpace(spaceName);
    for (const c of collections) {
      const col = await repo.createCollection(space.id, c.title);
      if (c.color) await db.collections.update(col.id, { color: c.color });
      await repo.addCards(
        col.id,
        c.cards.map(([title, url]) => ({ title, url })),
      );
    }
  }
}
