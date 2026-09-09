import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A TAB FOR THE CITY'S PICTURES (owner, 8 and 9 Sep) ──────────────────────
 *
 * "create a tab for city images, and only let users scroll images people may
 * have uploaded" — and, on seeing it, "just the photos and thoughts."
 *
 * City TV plays the city's videos on their own, full screen, a channel per
 * citizen. This is the still half: everything else citizens post —
 * photographs, and the text-only thoughts between them — read the way stills
 * are read, a column you scroll at your own pace, whole city, newest first. It
 * sits at 02, beside the television, because the pair is the point.
 *
 * THE ONE THING THAT CAN QUIETLY BREAK THE PROMISE IS THE LENS, and the first
 * cut used the wrong one. `photos` asks for posts that HAVE a photograph —
 * `media: { some: { kind: 'image' } }` — which is not the same sentence as
 * "posts that are not videos": a post carrying four pictures and a clip
 * satisfies it. `stills` asks the opposite question on the server, which also
 * lets thoughts through for free, and it excludes reposts — a repost row
 * carries no media of its own, so "no video media" is trivially true of a
 * repost OF a video. Those two clauses are what this file mostly exists for.
 */
describe('City Photos', () => {
  const page = code('features/social/pages/CityImages.tsx');
  const API = join(SRC, '../../together-city-chat/src/social');
  const api = readFileSync(join(API, 'dto/social.dto.ts'), 'utf8');
  const service = readFileSync(join(API, 'social.service.ts'), 'utf8');

  it('is key 02 on the Together TV rail, next to the television', () => {
    const items = HUBS.social.items;
    const two = items.find((i) => i.index === '02');
    expect(two?.path).toBe('/social/images');
    expect(two?.label).toBe('City Photos');
    // The rail says what the page carries, so a citizen looking for a thought
    // is not told the tab is only pictures.
    expect(two?.sub).toMatch(/thoughts/);
    // …and 01 is still the television it is the still half of.
    expect(items.find((i) => i.index === '01')?.path).toBe('/social/feed');
  });

  it('has a route behind the key — a rail entry with no page is a dead door', () => {
    expect(code('app/router.tsx')).toMatch(/path: '\/social\/images'/);
  });

  it('asks the server for what is NOT a video, rather than for what has a photo', () => {
    expect(page).toMatch(/useFeed\('stills'\)/);
    expect(api).toMatch(/'stills'/);
    expect(service).toMatch(/filter === 'stills' \? \{ media: \{ none: \{ kind: 'video' \} \}, repostOfId: null \}/);
    // Thoughts ride in on the same predicate: no media at all is also no video
    // media. There is no second query and no interleaving in the client.
    expect(page).not.toMatch(/useFeed\('photos'\)/);
    expect(page).not.toMatch(/m\.kind === 'image'/);
  });

  it('keeps a repost of a video out, which "no video media" alone would let in', () => {
    /* A repost row carries no media of its own — the feed hydrates it from the
       original — so the media clause is trivially true of one. This is the
       clause that stops a page promising no videos from serving one. */
    const at = service.indexOf("filter === 'stills' ?");
    expect(at).toBeGreaterThan(0);
    expect(service.slice(at, service.indexOf('\n', at))).toMatch(/repostOfId: null/);
  });

  it('is a lens on the city-wide read, not a second endpoint', () => {
    /* The feed read carries the audience gates, the block filter, the
       reachable-author rule and the cursor, and all four are tested where they
       live. A second read path for the same rows is a second place for an
       audience rule to be forgotten. */
    expect(service).toMatch(/filter === 'stills';/);
  });

  it('does not call the city empty while the first page is still arriving', () => {
    expect(page).toMatch(/const exhausted = !hasNextPage && !isFetchingNextPage && !feed\.isLoading;/);
    expect(page).toMatch(/exhausted && stills\.length === 0/);
  });

  it('keeps loading as the citizen scrolls', () => {
    expect(page).toMatch(/new IntersectionObserver/);
    expect(page).toMatch(/rootMargin: '400px'/);
  });

  it('says so when the read failed, instead of showing an empty city', () => {
    expect(page).toMatch(/Couldn’t load these posts\./);
    expect(page).toMatch(/This is a connection problem, not an empty city\./);
  });
});
