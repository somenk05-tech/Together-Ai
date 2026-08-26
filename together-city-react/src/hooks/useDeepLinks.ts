import { useEffect } from 'react';
import { router } from '@/app/router';
import { routeForDeepLink } from '@/lib/deep-links';

/**
 * A push payload has carried `togethercity://dating/chat/<id>` since the
 * phone shell shipped, and nothing opened it: the shell registered no URL
 * scheme and the web app listened for nothing. Both halves now exist — the
 * scheme in Info.plist and the manifest, the listener here.
 *
 * Read off `window.Capacitor` rather than an import: the app is served from
 * togethercity.app into the shell's WebView, so the plugin JS is the bridge's
 * to provide, not this bundle's. In a browser there is no bridge and this is
 * a no-op.
 */
type UrlOpen = { url: string };
interface CapBridge {
  Plugins?: { App?: { addListener(ev: 'appUrlOpen', fn: (e: UrlOpen) => void): Promise<{ remove(): void }> | { remove(): void } } };
}

export function useDeepLinks(): void {
  useEffect(() => {
    const app = (window as unknown as { Capacitor?: CapBridge }).Capacitor?.Plugins?.App;
    if (!app) return;
    let handle: { remove(): void } | undefined;
    void Promise.resolve(app.addListener('appUrlOpen', (e) => {
      const to = routeForDeepLink(e.url);
      if (to) void router.navigate(to);
    })).then((h) => { handle = h; });
    return () => handle?.remove();
  }, []);
}
