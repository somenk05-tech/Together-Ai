import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * Owner, 10 Sep, on the reader: "create city video tab on the side bar, and
 * make it in this exact look just with post from all people in this format —
 * also let users hide posts, photos, videos and thoughts, along with edit and
 * delete post tabs."
 */
describe('City Videos', () => {
  const rail = HUBS.social.items;

  it('is on the Together TV rail, after City Photos, and the rail counts without a gap', () => {
    expect(rail.find((i) => i.path === '/social/videos')).toMatchObject({ index: '03', label: 'City Videos' });
    expect(rail.find((i) => i.index === '02')?.path).toBe('/social/images');
    expect(rail.map((i) => i.index)).toEqual(rail.map((_, n) => String(n + 1).padStart(2, '0')));
  });

  it('has a page behind the key', () => {
    expect(code('app/router.tsx')).toMatch(/path: '\/social\/videos', element: <RequireAuth>\{wrap\(<SocVideos \/>\)\}/);
    expect(existsSync(join(SRC, 'features/social/pages/CityVideos.tsx'))).toBe(true);
  });

  it('reads the whole city’s videos and draws them as the reader’s post cards, playing on', () => {
    const page = code('features/social/pages/CityVideos.tsx');
    expect(page).toMatch(/useFeed\('videos'\)/);
    expect(page).toMatch(/<PostCard/);
    expect(page).toMatch(/className="sl-read-item"/);
    expect(page).toMatch(/autoplayVideo/);
    expect(page).toMatch(/onVideoEnded=\{\(\) => advance\(k\)\}/);
  });
});

describe('a post you can put away', () => {
  const card = code('features/social/PostCard.tsx');

  it('sits in the author’s menu between Edit and Delete as Hide from city, and turns back into Show in city', () => {
    const edit = card.indexOf('Edit post');
    const hide = card.indexOf("'Hide from city'");
    const del = card.indexOf('Delete post</button>');
    expect(edit).toBeGreaterThan(0);
    expect(hide).toBeGreaterThan(edit);
    expect(del).toBeGreaterThan(hide);
    expect(card).toMatch(/post\.hidden \? 'Show in city' : 'Hide from city'/);
  });

  it('marks a hidden post on the author’s own wall', () => {
    expect(card).toMatch(/Hidden · only you can see this/);
  });

  it('asks the server, which owns the rule', () => {
    expect(read('features/social/api.ts')).toMatch(/\/social\/posts\/\$\{postId\}\/visibility/);
  });
});

describe('the three items all show (owner, 10 Sep: "where is the delete post button")', () => {
  it('lifts the card’s paint containment while its menu is open, so Delete is not clipped', () => {
    expect(code('features/social/PostCard.tsx')).toMatch(/menuOpen \? 'card sl-post sl-menu-open' : 'card sl-post'/);
    expect(read('styles/social.css')).toMatch(/\.sl-post\.sl-menu-open \{ content-visibility: visible; position: relative; z-index: 6; \}/);
  });
});

describe('a phone holds the column (owner, 10 Sep: "fix the layout for photos on mobile phone")', () => {
  it('never lets a capped, aspect-ratio picture set a minimum width', () => {
    const card = code('features/social/PostCard.tsx');
    const boxes = card.match(/aspectRatio: String\((shown|ar)\)/g) ?? [];
    expect(boxes.length).toBe(3);
    expect(card.match(/minWidth: 0, aspectRatio: String\((shown|ar)\)/g)?.length).toBe(3);
  });
});

describe('the set scrolls like a phone (owner, 10 Sep: "give a scroll up feel for the together city tv")', () => {
  const tv = code('features/social/CityTV.tsx');
  it('changes video on a vertical swipe — up is next, down is back', () => {
    expect(tv).toMatch(/onTouchStart=\{onTouchStart\} onTouchMove=\{onTouchMove\} onTouchEnd=\{onTouchEnd\}/);
    expect(tv).toMatch(/const step = dy < 0 \? 1 : -1;/);
    expect(tv).toMatch(/Math\.abs\(dy\) < 60/);
  });
  it('brings the next picture in from the edge it came from, and not for reduced motion', () => {
    const css = read('styles/social.css');
    expect(css).toMatch(/@keyframes tv-rise \{ from \{ transform: translateY\(100%\); \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.tv-media\.in-up, \.tv-media\.in-down \{ animation: none; \}/);
  });
});
