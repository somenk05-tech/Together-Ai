import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const deck = read('pages/Investor.tsx');
const router = read('app/router.tsx');
const footer = read('layouts/Footer.tsx');

/**
 * THE DECK IS A PAGE.
 *
 * /investor is the platform deck: twenty-three slides an investor or a partner
 * scrolls through, in the city's own white-and-ink language rather than the
 * burgundy of the design it was drawn from.
 *
 * Four of the five things below are the ones that break QUIETLY, which is the
 * only reason to write a test for a marketing page at all:
 *
 *   · a photograph whose file is not in public/ renders as a broken frame on
 *     somebody else's screen, and the person showing the deck finds out in the
 *     room. `npm run build` does not check a runtime src string;
 *   · a slide dropped or duplicated during an edit changes the numbering the
 *     labels print, and nothing else notices;
 *   · the route moving inside the AppShell block would put the city header,
 *     the rail and the footer over a full-screen deck;
 *   · relief cases every <img> in a hairline outline, which is right for a
 *     product photo on a page of type and wrong for a full-bleed slide — the
 *     `no-case` opt-out is the whole difference, and it is one word to lose.
 */
describe('the deck is a page', () => {
  /* The COUNT is not the rule — the deck grows. The rule is that the numbers
     printed on the slides run 001, 002, 003 … with no gap, no repeat and no
     slide left holding the number of the one before it, which is what an
     insertion in the middle produces if the renumbering is done by hand. */
  it('numbers its slides in an unbroken run from 001', () => {
    const printed = [...deck.matchAll(/\bn="(\d{3})"/g)].map((m) => m[1]);
    expect(printed.length).toBeGreaterThan(20);
    const wanted = printed.map((_, i) => String(i + 1).padStart(3, '0'));
    expect(printed).toEqual(wanted);
  });

  it('ships every photograph it names', () => {
    const files = [...deck.matchAll(/([a-z-]+\.webp)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(15);
    const missing = [...new Set(files)].filter((f) => !existsSync(join(APP, 'public/investor', f)));
    expect(missing).toEqual([]);
  });

  it('leaves every slide photograph uncased', () => {
    const uncased = [...deck.matchAll(/<img[^>]*className="([^"]*)"/g)].map((m) => m[1]);
    expect(uncased.length).toBeGreaterThan(0);
    expect(uncased.filter((c) => !c.includes('no-case'))).toEqual([]);
  });

  it('mounts the deck outside the app shell', () => {
    expect(router).toMatch(/path: '\/investor', element: wrap\(<Investor \/>\)/);
    // The shell-less routes are the tail of the list — everything after the
    // last layout block. A route that drifts up into AppShell's children lands
    // before it, and this is the cheapest way to say so.
    const lastLayout = router.lastIndexOf('element: <HubLayout');
    expect(router.indexOf("path: '/investor'")).toBeGreaterThan(lastLayout);
  });

  it('offers the deck from the foot of the city', () => {
    expect(footer).toMatch(/<Link to="\/investor">Investor<\/Link>/);
  });

  /* A DECK WITH NO SHELL NEEDS ITS OWN DOOR, AND EVERY SLIDE NEEDS IT.
     The page is mounted outside AppShell, so there is no header and no rail to
     leave by — a viewer twenty slides deep has the browser's back button and
     whatever this page gives them. Label prints the slide number AND the door,
     and nothing else prints a slide number, so "every slide is numbered" (the
     first assertion in this file) plus "Label carries the link" is the whole
     proof that no slide is a dead end. */
  it('gives every slide a way back into the city', () => {
    expect(deck).toMatch(/function Label\([\s\S]{0,400}?className="dk-back" to="\/"/);
    const chunks = deck.split('<section className="dk-slide').slice(1);
    expect(chunks.length).toBeGreaterThan(15);
    expect(chunks.filter((c) => !c.includes('<Label'))).toEqual([]);
  });
});
