import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POST_TEXT_MAX } from '@/features/social/api';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');
const api = readFileSync(join(APP, '../together-city-chat/src/social/dto/social.dto.ts'), 'utf8');
const apiCtl = readFileSync(join(APP, '../together-city-chat/src/social/social.controller.ts'), 'utf8');

/**
 * ── THE WORDS HAVE ROOM, AND EMOJI (owner, 8 Sep) ───────────────────────────
 *
 * "remove the cap on the text part and also add emojis."
 *
 * 2,200 was Instagram's caption limit borrowed whole, and it is the wrong
 * shape for a city where a shopkeeper writes up a delivery, a citizen writes
 * up a day, or somebody puts the recipe under the photograph of the dish.
 *
 * A ceiling still exists, at 10,000, and it is not timidity: this column is
 * broadcast down the websocket to every follower and re-sent in every page of
 * every feed that carries it, so "no ceiling at all" is a paste bomb with a
 * fan-out. Nobody writing a post meets 10,000.
 *
 * THE NUMBER LIVES IN ONE PLACE PER SIDE. It was three literals — composer,
 * edit box, server — and the edit box's copy was how an edit could refuse text
 * the composer had just accepted.
 */
describe('the words have room', () => {
  it('is ten thousand, on both sides of the wire', () => {
    expect(POST_TEXT_MAX).toBe(10_000);
    expect(api).toMatch(/export const POST_TEXT_MAX = 10_000;/);
  });

  it('is one constant per side, not a literal per screen', () => {
    expect(code('features/social/pages/CreatePost.tsx')).toMatch(/const TEXT_MAX = POST_TEXT_MAX;/);
    expect(code('features/social/PostCard.tsx')).toMatch(/maxLength=\{POST_TEXT_MAX\}/);
    // Create and edit read the same name on the server, so an edit can never
    // exceed what a create allows.
    expect(api).toMatch(/text: z\.string\(\)\.max\(POST_TEXT_MAX\)\.optional\(\)/);
    expect(apiCtl).toMatch(/text: z\.string\(\)\.max\(POST_TEXT_MAX\)\.optional\(\)/);
    // The old number is gone from every one of them.
    for (const src of [code('features/social/pages/CreatePost.tsx'), code('features/social/PostCard.tsx'), api, apiCtl]) {
      expect(src).not.toMatch(/2200/);
    }
  });

  it('shows the counter when the wall is in sight, not from the first character', () => {
    const composer = code('features/social/pages/CreatePost.tsx');
    expect(composer).toMatch(/const COUNT_FROM = TEXT_MAX - 500;/);
    expect(composer).toMatch(/\{text\.length > COUNT_FROM && <span className="sl-count">/);
  });
});

describe('the emoji drawer', () => {
  const composer = code('features/social/pages/CreatePost.tsx');

  it('is one of the things a post can carry', () => {
    expect(composer).toMatch(/\{ key: 'emoji', label: 'Emoji', icon: 'sparkles', tint: 'teal' \}/);
    expect(composer).toMatch(/\{open === 'emoji' && \(/);
  });

  it('writes at the caret, replacing a selection — not at the end', () => {
    /* Appending would be simpler and wrong: three sentences in, going back to
       put a heart after the first one would put it after the third. */
    expect(composer).toMatch(/const from = el\.selectionStart \?\? text\.length;/);
    expect(composer).toMatch(/text\.slice\(0, from\) \+ ch \+ text\.slice\(to\)/);
    // The caret is restored on the NEXT frame, because React has to render the
    // new value first — set before that, it lands where the old value put it.
    expect(composer).toMatch(/requestAnimationFrame\(\(\) => \{ el\.focus\(\); el\.setSelectionRange\(caret, caret\); \}\);/);
  });

  it('cannot push a post past the ceiling', () => {
    expect(composer).toMatch(/\)\.slice\(0, TEXT_MAX\);/);
  });

  it('ships no picker library — the city already carries enough', () => {
    const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => /emoji/i.test(d))).toEqual([]);
  });
});
