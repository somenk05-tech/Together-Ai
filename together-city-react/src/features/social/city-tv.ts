import type { Post } from './api';

/**
 * THE DIAL OF TOGETHER CITY TV — pure. A channel is a citizen; the stream is
 * the For You lens in the wall's order. What is decided here is only which
 * citizen is on and which comes next; the set itself is CityTV.tsx.
 */

export interface Channel {
  handle: string; name: string; profileImage: string | null;
  /** The channel's tile: its newest post's picture (a video's poster), or nothing. */
  tile: string | null;
  /** The index of the channel's first post in the stream. */
  first: number;
}

/** The channels in the stream, in first-appearance order: one per citizen. */
export function channelsOf(items: readonly Post[]): Channel[] {
  const seen = new Set<string>();
  const out: Channel[] = [];
  items.forEach((p, i) => {
    const a = p.author;
    if (!a?.handle || seen.has(a.handle)) return;
    seen.add(a.handle);
    const m = p.media?.[0];
    const tile = m ? (m.kind === 'video' ? m.thumbUrl : m.url) : null;
    out.push({ handle: a.handle, name: a.name, profileImage: a.profileImage ?? null, tile, first: i });
  });
  return out;
}

/** The index of the first post by the channel `step` places along the dial
 *  from the channel currently on — wrapping, so the dial has no end. */
export function tuneIndex(items: readonly Post[], at: number, step: 1 | -1): number {
  const channels = channelsOf(items);
  if (channels.length < 2) return at;
  const current = items[at]?.author?.handle;
  const ci = Math.max(0, channels.findIndex((c) => c.handle === current));
  const next = channels[(ci + step + channels.length) % channels.length];
  const idx = items.findIndex((p) => p.author?.handle === next.handle);
  return idx < 0 ? at : idx;
}
