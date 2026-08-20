import { useEffect } from 'react';
import type { HubKey } from '@/types';
import { useUiStore } from '@/store/ui.store';
import { useSkinStore } from '@/store/skin.store';
import { isSkinnable } from '@/config/skins';

/**
 * Sets `data-hub` on <html> so the per-hub accent CSS (tokens.css) applies —
 * mirrors how tc.js set `data-hub` on <body> in the vanilla site.
 *
 * AND `data-skin`, WHICH IS THE ONLY PLACE THAT ATTRIBUTE IS EVER WRITTEN.
 *
 * That is the whole difference between this and the dark-mode switch relief
 * .spec still bans. The failure that ban was written against was a theme store
 * nothing imported which nevertheless set an attribute on <html> the moment
 * some unrelated lazy chunk loaded — a repaint arriving from a module nobody
 * could name. So the skin rides on the hook that ALREADY owns this element's
 * palette attribute, in the same effect, with the same cleanup:
 *
 *   · one writer, here;
 *   · it is set only for a hub on the two-name allow-list in config/skins.ts,
 *     so no other room can be repainted even by a bad store value;
 *   · it is REMOVED on the way out, so leaving Mail cannot leave burgundy
 *     behind on Medical — the exact class of bug the ban exists for;
 *   · and null (the default) removes it too, so the city's own white and black
 *     is the literal absence of this feature rather than a ninth palette
 *     pretending to be it.
 */
export function useHubTheme(hub: HubKey | null): void {
  const setActiveHub = useUiStore((s) => s.setActiveHub);
  const skins = useSkinStore((s) => s.skins);
  const skin = isSkinnable(hub) ? skins[hub] : null;

  useEffect(() => {
    const root = document.documentElement;
    if (hub) root.setAttribute('data-hub', hub);
    else root.removeAttribute('data-hub');
    if (skin) root.setAttribute('data-skin', skin);
    else root.removeAttribute('data-skin');
    setActiveHub(hub);
    return () => {
      root.removeAttribute('data-hub');
      root.removeAttribute('data-skin');
    };
  }, [hub, skin, setActiveHub]);
}
