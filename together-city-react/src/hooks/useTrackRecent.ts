import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecentStore } from '@/store/recent.store';
import { titleFor } from '@/nav/registry';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';

/** Paths that are never worth remembering as "recent". */
const SKIP = new Set(['/', '/sign-in', '/signin', '/verify', '/settings/privacy']);

/**
 * Records the current page into the recently-viewed store on every navigation,
 * so the super-app can always answer "where did I just come from?" — the memory
 * behind Recently Viewed and "Continue where you left off" (audit 3.3).
 */
export function useTrackRecent() {
  const { pathname } = useLocation();
  const record = useRecentStore((s) => s.record);
  useEffect(() => {
    if (SKIP.has(pathname)) return;
    const first = pathname.split('/').filter(Boolean)[0];
    const hub = (Object.keys(HUBS) as HubKey[]).find((k) => k === first);
    record({ path: pathname, label: titleFor(pathname), hub: hub ?? 'account' });
  }, [pathname, record]);
}
