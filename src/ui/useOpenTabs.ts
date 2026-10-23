import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/context';
import type { OpenWindow } from '../platform/ports';

export type TabsAccess = 'checking' | 'granted' | 'needed';

/** Live list of the browser's windows and tabs. Reading it needs the optional `tabs` permission. */
export function useOpenTabs(enabled: boolean) {
  const platform = usePlatform();
  const [access, setAccess] = useState<TabsAccess>('checking');
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Whether the optional `tabGroups` permission is granted, which is what makes browser tab groups visible. */
  const [groupsAccess, setGroupsAccess] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setWindows(await platform.tabs.listWindows());
      setError(null);
    } catch (e) {
      console.error('Tabarium: listing open tabs failed', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [platform]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([platform.permissions.has('tabs'), platform.permissions.has('tabGroups')])
      .then(([has, groups]) => {
        if (!alive) return;
        setAccess(has ? 'granted' : 'needed');
        setGroupsAccess(groups);
      })
      .catch((e: unknown) => {
        console.error('Tabarium: checking the tabs permission failed', e);
        if (alive) setAccess('needed');
      });
    return () => {
      alive = false;
    };
  }, [enabled, platform]);

  useEffect(() => {
    if (!enabled || access !== 'granted') return;
    // Scheduled instead of called inline: the first read must not set state synchronously inside the effect.
    const first = setTimeout(() => void refresh(), 0);
    // `groupsAccess` re-subscribes after a mid-session grant: the tabGroups events only exist once the
    // optional permission is granted, and the watcher picks its event list at subscribe time.
    const unwatch = platform.tabs.watch(() => void refresh());
    return () => {
      clearTimeout(first);
      unwatch();
    };
  }, [enabled, access, groupsAccess, platform, refresh]);

  /** Must run from a click: the browser shows the permission prompt only for a user gesture. */
  const grant = useCallback(async () => {
    try {
      if (await platform.permissions.request('tabs')) setAccess('granted');
      else setError('Tabarium needs the "tabs" permission to list your open tabs.');
    } catch (e) {
      console.error('Tabarium: requesting the tabs permission failed', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [platform]);

  /** Also needs a click. Shows the groups the user already made in the browser. */
  const grantGroups = useCallback(async () => {
    try {
      if (await platform.permissions.request('tabGroups')) {
        setGroupsAccess(true);
        await refresh();
      } else setError('Tabarium needs the "tabGroups" permission to show browser tab groups.');
    } catch (e) {
      console.error('Tabarium: requesting the tabGroups permission failed', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [platform, refresh]);

  return { access, groupsAccess, windows, error, grant, grantGroups, refresh };
}
