import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── ONE UPLOAD, EVERY CHANNEL (owner, 17 Sep) ───────────────────────────────
 *
 * "Create a together social media page where I upload the video there and all
 * details are automatically uploaded on youtube and instagram channels from
 * there, connect dating with dating site, health with health."
 *
 * The desk lives on /dev behind its password; the sign-in pop-up comes back
 * through a page that only talks to the window that opened it; and each hub
 * landing shows its own topic's films.
 */
describe('Together Social, the media desk', () => {
  const desk = strip(read('src/features/dev/Media.tsx'));
  const api = strip(read('src/features/dev/media.api.ts'));
  const back = strip(read('src/features/dev/SocialConnected.tsx'));

  it('is a tab on the developer page, and /dev?tab=social opens on it', () => {
    const dev = strip(read('src/features/dev/pages/Dev.tsx'));
    expect(dev).toContain("{tab === 'social' && <DevMedia password={password} />}");
    expect(dev).toMatch(/get\('tab'\) === 'social'/);
  });

  it('never keeps the developer password anywhere but the page', () => {
    for (const src of [desk, api, back]) {
      expect(src).not.toMatch(/localStorage|sessionStorage/);
    }
    expect(api).toContain("'x-dev-password'");
  });

  it('takes a sign-in only from its own origin and its own message type', () => {
    expect(desk).toMatch(/ev\.origin !== window\.location\.origin/);
    expect(desk).toContain('SIGNIN_MESSAGE');
    expect(back).toMatch(/postMessage\(msg, window\.location\.origin\)/);
    expect(back).not.toMatch(/postMessage\([^)]*'\*'/);
  });

  it('registers the pop-up landing behind sign-in', () => {
    const router = read('src/app/router.tsx');
    expect(router).toContain("{ path: '/dev/social/connected', element: <RequireAuth>{wrap(<SocialConnected />)}</RequireAuth> }");
  });

  it('is drawn by its stylesheet, not by inline styles', () => {
    expect(desk).not.toMatch(/style=\{\{/);
    expect(read('src/main.tsx')).toContain("import './styles/media-desk.css';");
    const css = strip(read('src/styles/media-desk.css'));
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsl\(/i);
    expect(css).not.toMatch(/box-shadow/);
  });

  it('says a published post cannot be taken down from here', () => {
    expect(desk).toMatch(/Anything published stays up/);
  });
});

describe('a hub shows its own films', () => {
  it('draws the strip under every hub landing, desktop and phone', () => {
    const landing = strip(read('src/pages/HubLanding.tsx'));
    expect(landing.match(/<HubFilms hub=\{hub\} \/>/g)).toHaveLength(2);
  });

  it('asks only when signed in, and draws nothing when there is nothing', () => {
    const films = strip(read('src/features/social/HubFilms.tsx'));
    expect(films).toMatch(/enabled: authed/);
    expect(films).toMatch(/items\.length === 0\) return null/);
    expect(films).not.toMatch(/style=\{\{/);
  });
});
