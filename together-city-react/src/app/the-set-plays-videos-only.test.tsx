import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CityTV } from '@/features/social/CityTV';
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
  });

  it('draws nothing for a photograph or a thought — no image, no title card', () => {
    expect(draw([post('1', [{ id: 'm1', url: 'https://x/a.jpg', kind: 'image', thumbUrl: null }], 'a picture')])).toBe('');
    expect(draw([post('3', [], 'just a thought')])).toBe('');
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
