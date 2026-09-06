import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchPath, matchRoutes } from 'react-router-dom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CityTV, clockText } from '@/features/social/CityTV';
import type { Post } from '@/features/social/api';

/**
 * THE SET PLAYS VIDEOS ONLY — owner, 5 Sep: "no images on the TV, and
 * autoplay." The screen draws a post's video, autoplaying, with its caption;
 * a post with no video draws nothing at all — no photograph, no title card.
 * Rendered without a browser, so this proves the drawing; the hand-over at
 * the end of a video and the wrap to the top are the effects in CityTV.tsx.
 */

function post(id: string, media: Post['media'], text: string | null = null): Post {
  return {
    id, text, feeling: null, lat: null, lng: null,
    author: { id: 'u1', handle: 'asha', name: 'Asha', profileImage: null },
    media, likes: 0, comments: 0,
  } as Post;
}

const draw = (items: Post[], startAt = 0) => renderToStaticMarkup(
  createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(CityTV, { items, startAt, onOpenChannel: () => {}, onOpenChannels: () => {} })),
);

describe('the screen', () => {
  it('draws a video, autoplaying, with its poster and caption', () => {
    const html = draw([post('2', [{ id: 'm2', url: 'https://x/b.mp4', kind: 'video', thumbUrl: 'https://x/b.jpg' }], 'the sea')]);
    expect(html).toMatch(/<video[^>]*class="tv-media"[^>]*src="https:\/\/x\/b\.mp4"/);
    expect(html).toMatch(/<video[^>]*autoplay/i);
    expect(html).toContain('poster="https://x/b.jpg"');
    expect(html).toContain('the sea');
    // Until the metadata arrives the set says it is tuning in, over the poster.
    expect(html).toContain('Tuning in');
    expect(html).toContain('tv-progress');
  });

  it('draws nothing for a photograph or a thought — no image, no title card', () => {
    expect(draw([post('1', [{ id: 'm1', url: 'https://x/a.jpg', kind: 'image', thumbUrl: null }], 'a picture')])).toBe('');
    expect(draw([post('3', [], 'just a thought')])).toBe('');
  });

  it('a video still being made playable, or one that could not be, is not a broadcast', () => {
    const processing = post('4', [{ id: 'm4', url: 'https://x/d.quicktime', kind: 'video', thumbUrl: 'https://x/d.jpg', state: 'processing' }]);
    const failed = post('5', [{ id: 'm5', url: 'https://x/e.quicktime', kind: 'video', thumbUrl: null, state: 'failed' }]);
    expect(draw([processing])).toBe('');
    expect(draw([failed])).toBe('');
  });

  it('tells the time like a clock, and past an hour like a longer one', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(65.9)).toBe('1:05');
    expect(clockText(3600 + 5 * 60 + 7)).toBe('1:05:07');
    expect(clockText(NaN)).toBe('0:00');
  });

  it('draws the slider, disabled until the duration is known', () => {
    const html = draw([post('2', [{ id: 'm2', url: 'https://x/b.mp4', kind: 'video', thumbUrl: null }])]);
    const slider = html.match(/<inp[u]t[^>]*class="tv-scrub"[^>]*>/)?.[0] ?? ''; // spelt apart so the a11y scan reads the SET, not this line
    expect(slider).toContain('type="range"');
    expect(slider).toContain('aria-label="Move through the video"');
    expect(slider).toContain('disabled');
  });

  it('has a key for what is next, closed until pressed', () => {
    const html = draw([post('2', [{ id: 'm2', url: 'https://x/b.mp4', kind: 'video', thumbUrl: null }])]);
    expect(html).toMatch(/aria-label="What&#x27;s next"|aria-label="What's next"/);
    expect(html).not.toContain('tv-next-l');
  });

  it('takes the video out of a mixed post, and comes on tuned where it was told', () => {
    const items = [
      post('1', [{ id: 'm1', url: 'https://x/a.jpg', kind: 'image', thumbUrl: null }]),
      post('2', [{ id: 'm2', url: 'https://x/b.jpg', kind: 'image', thumbUrl: null }, { id: 'm3', url: 'https://x/c.mp4', kind: 'video', thumbUrl: null }]),
    ];
    const html = draw(items, 1);
    expect(html).toContain('src="https://x/c.mp4"');
    expect(html).not.toContain('<img class="tv-media"');
  });
});

/**
 * WHERE THE SET LETS YOU OUT — owner, 6 Sep: "the together city button should
 * take them to the together city social media profile page."
 *
 * It used to land on the hub, which is a rail of doors read by somebody who
 * has just spent ten minutes watching the city and is one tap from posting to
 * it. The profile is where their own posts, their stats and the door to a new
 * one already are.
 */
describe('the way out of the set', () => {
  const page = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../features/social/pages/CityTVPage.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('lands on the profile rather than the hub', () => {
    expect(page).toMatch(/navigate\('\/social\/profile'\)/);
    expect(page).not.toMatch(/navigate\('\/social'\)/);
  });

  it('leaves by one door — the button and Escape arrive in the same place', () => {
    // Two ways out of one room that land somewhere different is two rooms.
    expect(page).toMatch(/onClick=\{leave\}/);
    expect(page).toMatch(/onLeave=\{leave\}/);
  });
});

/**
 * A CHANNEL HAS A SHORT ADDRESS — owner, 6 Sep: "togethercity.app/social/feed
 * ?channel=somen — rename this to togethercity.app/@somen."
 *
 * A link somebody puts in a bio has to be sayable out loud. The '@' is the
 * convention every citizen already reads as a person, and it keeps handles
 * clear of the hub names at the root — nobody can take a handle that shadows
 * /astrology.
 */
describe('the short address of a channel', () => {
  const router = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'router.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const page = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../features/social/pages/CityTVPage.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const channels = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../features/social/pages/Channels.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('answers on /@handle, and the router really matches it', () => {
    expect(router).toMatch(/path: '\/:vanity'/);
    /* NOT A SOURCE ASSERTION ALONE, and this is the one that earned its keep:
       the first version of this route was `/@:handle`, which reads perfectly
       and matches NOTHING — a router param is a whole segment. It compiled,
       it type-checked, and the channel link 404'd. */
    expect(matchPath('/@:handle', '/@somen')).toBeNull();
    expect(matchPath('/:vanity', '/@somen')?.params).toEqual({ vanity: '@somen' });
  });

  it('lets every hub name win the segment it shares with a handle', () => {
    // Static beats dynamic in the ranking, so /astrology is never a channel.
    const ranked = matchRoutes(
      [{ path: '/astrology' }, { path: '/:vanity' }],
      '/astrology',
    );
    expect(ranked?.[0].route.path).toBe('/astrology');
  });

  it('sends a wrong turn to the 404 rather than to a set tuned to nobody', () => {
    expect(page).toMatch(/startsWith\('@'\)/);
    expect(page).toMatch(/<NotFound \/>/);
  });

  it('tunes the set from the path, and still from the old query', () => {
    // Links already sent and cards already shared are not ours to break.
    expect(page).toMatch(/pathHandle \?\? params\.get\('channel'\)/);
    expect(page).toMatch(/vanity\?\.startsWith\('@'\) \? vanity\.slice\(1\)/);
    expect(router).toMatch(/path: '\/social\/feed'/);
  });

  it('hands out the short address from the channels page', () => {
    expect(channels).toMatch(/`\/@\$\{encodeURIComponent\(c\.handle\)\}`/);
    expect(channels).not.toMatch(/social\/feed\?channel=/);
  });
});
