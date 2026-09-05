import { describe, expect, it } from 'vitest';
import { channelsOf, tuneIndex } from '@/features/social/city-tv';
import type { Post } from '@/features/social/api';

/**
 * A CHANNEL IS A CITIZEN — owner ask, 5 Sep: Together City TV in place of the
 * city feed, "and the channel takes them to the profile". The dial is pure,
 * so the promise is checked here without a screen: one channel per citizen in
 * the order the stream first shows them, the dial wraps, and tuning lands on
 * that citizen's FIRST post, never a later one.
 */

function post(id: string, handle: string, media: Post['media'] = []): Post {
  return {
    id, text: null, feeling: null, lat: null, lng: null,
    author: { id: `u-${handle}`, handle, name: handle.toUpperCase(), profileImage: null },
    media, likes: 0, comments: 0,
  } as Post;
}

const stream = [
  post('1', 'asha', [{ id: 'm1', url: 'a.jpg', kind: 'image', thumbUrl: null }]),
  post('2', 'bo', [{ id: 'm2', url: 'b.mp4', kind: 'video', thumbUrl: 'b.jpg' }]),
  post('3', 'asha'),
  post('4', 'cy'),
];

describe('the dial', () => {
  it('one channel per citizen, in first-appearance order, tiled by the newest picture', () => {
    const c = channelsOf(stream);
    expect(c.map((x) => x.handle)).toEqual(['asha', 'bo', 'cy']);
    expect(c.map((x) => x.first)).toEqual([0, 1, 3]);
    expect(c[0].tile).toBe('a.jpg');
    expect(c[1].tile).toBe('b.jpg'); // a video's poster, not the file
    expect(c[2].tile).toBeNull();
  });

  it('down from a channel lands on the NEXT citizen\'s first post, and wraps', () => {
    expect(tuneIndex(stream, 0, 1)).toBe(1);   // asha → bo
    expect(tuneIndex(stream, 2, 1)).toBe(1);   // asha's second post → still bo
    expect(tuneIndex(stream, 3, 1)).toBe(0);   // cy → round to asha
    expect(tuneIndex(stream, 0, -1)).toBe(3);  // asha ↑ → cy
  });

  it('a stream with one citizen has nowhere to tune', () => {
    const one = [post('1', 'asha'), post('2', 'asha')];
    expect(tuneIndex(one, 1, 1)).toBe(1);
    expect(channelsOf([])).toEqual([]);
  });
});
