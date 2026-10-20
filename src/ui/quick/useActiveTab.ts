import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../../platform/context';
import type { OpenTab } from '../../platform/ports';

interface State {
  /** undefined while reading, null when the current page cannot be read or saved. */
  tab: OpenTab | null | undefined;
  hasAccess: boolean;
  error: string | null;
}

/**
 * The tab the user is on. The side panel stays open while they switch tabs, so this follows the browser.
 * Reading the address of a tab needs the optional `tabs` permission; `allow` asks for it (call it from a click).
 */
export function useActiveTab() {
  const platform = usePlatform();
  const [state, setState] = useState<State>({ tab: undefined, hasAccess: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => platform.tabs.watchActiveTab(() => setVersion((v) => v + 1)), [platform]);

  useEffect(() => {
    let alive = true;
    Promise.all([platform.tabs.getActiveTab(), platform.permissions.has('tabs')])
      .then(([tab, hasAccess]) => {
        if (alive) setState({ tab, hasAccess, error: null });
      })
      .catch((e: unknown) => {
        console.error('Tabarium: reading the active tab failed', e);
        if (alive) setState({ tab: null, hasAccess: true, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
    };
  }, [platform, version]);

  /** Resolves to whether the permission is now granted. Must run from a click: the prompt needs a user gesture. */
  const allow = useCallback(async () => {
    const granted = await platform.permissions.request('tabs');
    if (granted) setVersion((v) => v + 1);
    return granted;
  }, [platform]);

  return { ...state, allow };
}
