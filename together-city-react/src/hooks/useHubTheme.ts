import { useEffect } from 'react';
import type { HubKey } from '@/types';
import { useUiStore } from '@/store/ui.store';

/**
 * Sets `data-hub` on <html> so the per-hub accent CSS (tokens.css) applies —
 * mirrors how tc.js set `data-hub` on <body> in the vanilla site.
 */
export function useHubTheme(hub: HubKey | null): void {
  const setActiveHub = useUiStore((s) => s.setActiveHub);
  useEffect(() => {
    const root = document.documentElement;
    if (hub) root.setAttribute('data-hub', hub);
    else root.removeAttribute('data-hub');
    setActiveHub(hub);
    return () => { root.removeAttribute('data-hub'); };
  }, [hub, setActiveHub]);
}
