import { useCallback, useEffect, useRef, useState } from 'react';
import { describeCards } from '../core/describe';
import { db, repo } from '../core/instance';
import { updateSettings } from '../core/settings';
import type { Card } from '../core/types';
import { usePlatform } from '../platform/context';

interface Options {
  /** The setting: read the pages of new Inbox links by itself. */
  enabled: boolean;
  /** The Inbox page is on screen. Pages are read only while it is. */
  active: boolean;
  cards: readonly Card[];
  reportError: (what: string, e: unknown) => void;
}

/** Reads what Inbox pages say about themselves: on request, and by itself for new links once the user has allowed it. */
export function useInboxReading({ enabled, active, cards, reportError }: Options) {
  const platform = usePlatform();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const running = useRef(false);
  const summary = (read: number, failed: number) => `Read ${read} page${read === 1 ? '' : 's'}${failed > 0 ? `, ${failed} could not be read` : ''}.`;

  // New links that were never read, as one stable key so the effect runs when the set changes, not on every render.
  const unreadKey = active && enabled ? cards.filter((c) => c.pageInfoAt === null).map((c) => c.id).sort().join(',') : '';
  useEffect(() => {
    if (unreadKey === '' || running.current) return;
    let alive = true;
    running.current = true;
    void (async () => {
      // Access to sites may have been taken back since; then nothing happens until the user asks again.
      if (!(await platform.permissions.hasAllSites())) return;
      setBusy(true);
      const result = await describeCards(db, repo, unreadKey.split(','));
      if (alive) setNote(summary(result.read, result.failed.length));
    })()
      .catch((e: unknown) => reportError('Reading pages', e))
      .finally(() => {
        running.current = false;
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [unreadKey, platform, reportError]);

  /** Reads the given pages. Call it from a click: the first time it asks for access to sites. */
  const read = useCallback(
    async (ids: readonly string[]) => {
      setBusy(true);
      setNote(null);
      try {
        if (!(await platform.permissions.requestAllSites())) throw new Error('Tabarium needs access to websites to read their descriptions.');
        await updateSettings(db, { fetchDescriptions: true });
        const result = await describeCards(db, repo, ids);
        setNote(summary(result.read, result.failed.length));
      } catch (e) {
        reportError('Reading pages', e);
      } finally {
        setBusy(false);
      }
    },
    [platform, reportError],
  );

  return { busy, note, read };
}
