import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeForDeepLink } from '@/lib/deep-links';

/**
 * A push carries togethercity://dating/chat/<id>. The shell registers the
 * scheme, the app listens, and the link lands in the room it names.
 */
describe('a link opens the room it names', () => {
  it('maps the scheme every push already carries', () => {
    expect(routeForDeepLink('togethercity://dating/chat/abc')).toBe('/dating/chats?c=abc');
    expect(routeForDeepLink('togethercity://chat/xyz')).toBe('/chats?c=xyz');
    expect(routeForDeepLink('togethercity://dating/matches')).toBe('/dating/matches');
    expect(routeForDeepLink('https://togethercity.app/dating/safety')).toBe('/dating/safety');
  });

  it('ignores anything that is not ours', () => {
    expect(routeForDeepLink('https://example.com/dating/chat/abc')).toBeNull();
    expect(routeForDeepLink('not a url')).toBeNull();
  });

  it('is registered on both phones and listened for above the router', () => {
    const plist = readFileSync(new URL('../../../together-city-mobile/ios/App/App/Info.plist', import.meta.url), 'utf8');
    const manifest = readFileSync(new URL('../../../together-city-mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(plist).toMatch(/<string>togethercity<\/string>/);
    expect(manifest).toMatch(/android:scheme="togethercity"/);
    expect(app).toMatch(/useDeepLinks\(\)/);
  });
});
