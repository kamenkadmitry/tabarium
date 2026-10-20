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
    platform.permissions
      .has('tabs')
      .then((has) => alive && setAccess(has ? 'granted' : 'needed'))
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
    const unwatch = platform.tabs.watch(() => void refresh());
    return () => {
      clearTimeout(first);
      unwatch();
    };
  }, [enabled, access, platform, refresh]);

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

  return { access, windows, error, grant, refresh };
}
