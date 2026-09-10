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

  it('sits in the author’s menu between Edit and Delete, and turns back into Unhide', () => {
    const edit = card.indexOf('Edit post');
    const hide = card.indexOf("'Hide post'");
    const del = card.indexOf('Delete post</button>');
    expect(edit).toBeGreaterThan(0);
    expect(hide).toBeGreaterThan(edit);
    expect(del).toBeGreaterThan(hide);
    expect(card).toMatch(/post\.hidden \? 'Unhide post' : 'Hide post'/);
  });

  it('marks a hidden post on the author’s own wall', () => {
    expect(card).toMatch(/Hidden · only you can see this/);
  });

  it('asks the server, which owns the rule', () => {
    expect(read('features/social/api.ts')).toMatch(/\/social\/posts\/\$\{postId\}\/visibility/);
  });
});
