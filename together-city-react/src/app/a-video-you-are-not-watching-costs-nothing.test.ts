import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old code as the thing they exist to correct. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A VIDEO YOU ARE NOT WATCHING COSTS NOTHING ──────────────────────────────
 *
 * Reported as scroll stutter and video hitching on the Social Life feed, on
 * phone and desktop, getting worse the longer you scroll. The feed card's
 * video had three faults, and every one of them was already solved twenty
 * lines away in ReelsView — the other player, for the same media, written by
 * the same hand.
 *
 *   1 · NO POSTER. The card rendered a bare `<video>`, so there was nothing to
 *       look at until enough of a fifty-megabyte file arrived to decode one
 *       frame. The still already exists: `thumbUrl` is the poster the composer
 *       captures, the guard screens and the API signs, and the profile grid
 *       and ReelsView both render it. The feed card asked for video bytes to
 *       show a picture it already had.
 *
 *   2 · `near` NEVER FLIPPED BACK. `setNear(true); io.disconnect();` — true
 *       once and never false again, so every video scrolled PAST kept its src
 *       with `preload="auto"` for the life of the page. ReelsView fixed this
 *       exact bug on 30 Aug and wrote the diagnosis down: "two hundred
 *       `<video>` elements holding two hundred buffers: on mobile Safari that
 *       is a tab crash, not a slowdown."
 *
 *   3 · `preload="auto"` FOR EVERYTHING NEARBY. "Take as much of this as you
 *       can", said about a fifty-megabyte file, about every video within a
 *       screen and a half — which is how the one being watched ends up queued
 *       behind four that are not, on six connections per host.
 *
 * These are asserted against the SOURCE because a jsdom test cannot observe an
 * IntersectionObserver, a preload policy or a network queue — the three things
 * that actually matter here. That limit is the reason the assertions are
 * narrow: each one names a specific line that was wrong.
 */
describe('the feed card does not download videos nobody is watching', () => {
  const card = code('features/social/PostCard.tsx');

  it('gives the video the poster frame the app already screened and stored', () => {
    expect(card).toMatch(/poster=\{poster \?\? undefined\}/);
    // …and the card actually hands it one, from the media row.
    expect(card).toMatch(/<VideoFrame[^>]*poster=\{m\.thumbUrl\}/);
  });

  it('lets `near` go false again, so leaving the window releases the bytes', () => {
    // The exact shape that shipped. If it returns, so does the accumulation.
    expect(card).not.toMatch(/setNear\(true\);\s*io\.disconnect\(\)/);
    expect(card).toMatch(/setNear\(entries\[0\]\.isIntersecting\)/);
  });

  it('preloads metadata for a nearby video and the whole file only for one being watched', () => {
    expect(card).toMatch(/preload=\{!near \? 'none' : \(isNew \|\| playing \|\| ctl\) \? 'auto' : 'metadata'\}/);
  });

  it('still pins a just-posted video, which is why the citizen is on the page', () => {
    expect(card).toMatch(/if \(isNew\) return;/);
  });
});

describe('weakening the preload did not break the fast fling', () => {
  const card = code('features/social/PostCard.tsx');

  /**
   * The card can become mostly-visible BEFORE the src is attached — a fast
   * fling outruns the preload margin — so the wish to play is kept and
   * honoured when the source arrives. That recovery used to hang on a
   * `loadeddata` listener alone, which was safe while `preload="auto"` made
   * the event a near-certainty.
   *
   * It is not safe with `preload="metadata"`: the browser may stop after the
   * header, and whether it decodes a first frame — which is what `loadeddata`
   * means — is a per-browser decision, with mobile Safari the conservative
   * one. A fast fling on a phone is exactly the case this exists for.
   *
   * This is the regression the preload change could have shipped: a bandwidth
   * bug traded for a video that silently never starts. So the arrival of the
   * src triggers the attempt directly.
   */
  it('retries the play when the source arrives, not only on a media event', () => {
    expect(card).toMatch(/useEffect\(\(\) => \{ if \(near\) attempt\(\); \}, \[near, attempt\]\);/);
  });

  it('keeps the wish somewhere the src effect can read it', () => {
    // A local `let` inside the intersection effect could not be seen by the
    // effect that watches `near`, which is why this is a ref.
    expect(card).toMatch(/const wantsPlay = useRef\(false\);/);
    expect(card).toMatch(/wantsPlay\.current = true; attempt\(\);/);
  });

  it('still listens for loadeddata, because two cheap ways to notice beat one', () => {
    expect(card).toMatch(/addEventListener\('loadeddata', attempt\)/);
  });

  it('forgets the wish when the card leaves, so it cannot fire later', () => {
    // Without this a card scrolled past could start playing when its src
    // finally arrived, with nothing on screen to explain the sound.
    expect(card).toMatch(/wantsPlay\.current = false;\s*releasePlayback\(el\);/);
  });
});

describe('the two players agree, which is the point', () => {
  /**
   * The fault here was never that anybody wrote this badly. It is that the feed
   * card and ReelsView are two players for the same media, and a fix landed on
   * one of them. This asserts the property rather than the diff, so the next
   * time one learns something the other is checked against it.
   */
  const both = ['features/social/PostCard.tsx', 'features/social/ReelsView.tsx'].map(code);

  it('both give their video element a poster', () => {
    for (const p of both) expect(p).toMatch(/<video[\s\S]{0,400}poster=/);
  });

  it('neither latches `near` permanently true', () => {
    for (const p of both) expect(p).not.toMatch(/setNear\(true\);\s*io\.disconnect\(\)/);
  });

  it('both gate the src on being near', () => {
    for (const p of both) expect(p).toMatch(/src=\{near \? [\w.]+ : undefined\}/);
  });
});

describe('a card off screen is not laid out, painted or decoded', () => {
  const css = read('styles/social.css') + read('styles/relief.css');

  it('the phone feed card skips itself when it is far away', () => {
    expect(css).toMatch(/\.sl-post \{[^}]*content-visibility: auto/s);
  });

  it('and so does a desktop wall tile, which holds a full-size photograph', () => {
    // The wall renders a grid of these; a tile three screens down was costing
    // layout, paint and an image decode for something nobody is looking at.
    expect(css).toMatch(/\.poster \{[^}]*content-visibility: auto/s);
  });
});
