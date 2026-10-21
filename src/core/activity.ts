import type { TabariumDB } from './db';
import type { ActivityType } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds to today's counter of a kind of event. Must run inside a transaction that includes the `activity` table. */
export async function bumpActivity(db: TabariumDB, type: ActivityType, count: number, at: number = Date.now()): Promise<void> {
  if (count <= 0) return;
  const day = dayKey(at);
  const id = `${day}|${type}`;
  const row = await db.activity.get(id);
  await db.activity.put({ id, day, type, count: (row?.count ?? 0) + count });
}
