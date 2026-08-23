import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/** An @font-face body DECLARES a family — naming it there is the only way to
 *  load the file. Every rule about which faces a page may USE has to read past
 *  these, or it flags the declaration that makes the face exist at all. */
const stripFaces = (css: string) => css.replace(/@font-face\s*\{[^}]*\}/g, ' ');

/** A file is allowed to explain itself. Comments are not code. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const tokens = read('src/styles/tokens.css');
const relief = read('src/styles/relief.css');
const layout = read('src/styles/layout.css');
const index = read('src/index.css');
/* Mira's room is the fourth stylesheet, and every rule in this file was blind
   to it until it carried a red ground of its own. A stylesheet no ratchet
   reads is a second design system with a head start. */
const mira = read('src/styles/mira.css');
/* Social Life's sheet is the fifth, and it is on this list for exactly the
   reason written above Mira's. It spent two days deleted — a stale copy of
   relief.css wrote over the 216 lines that held it — and no rule in this file
   would have said so, because none of them knew the block existed. */
const social = read('src/styles/social.css');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(APP, dir))) {
    const rel = join(dir, name);
    if (statSync(join(APP, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.tsx')) out.push(rel);
  }
  return out;
}
const PAGES = walk('src');

/**
 * COLOUR IS DATA HERE, NOT MATERIAL.
 *
 * Every entry is a literal that must NOT follow the theme, and the reason is
 * the entry. This is the same list the sweep script refuses to touch, written
 * out again on purpose: if the two ever disagree, one of them is wrong and the
 * disagreement is the thing worth noticing.
 */
const COLOUR_IS_DATA: Record<string, string> = {
  'src/features/travel/pages/Flights.tsx':
    'airline brand colours — third-party marks',
  'src/features/nutrition/pages/MealPlan.tsx':
    'macro chart series — four series that must stay distinguishable',
  'src/features/nutrition/components/VegMark.tsx':
    'the FSSAI veg / non-veg mark — a legal symbol',
  'src/features/calendar/pages/Calendar.tsx':
    'hub category legend — categorical, not pass/fail',
  'src/features/entertainment/pages/movieKit.tsx':
    'seeded poster-placeholder gradients',
  'src/features/auth/pages/RegisterForm.tsx':
    'password-strength ramp — an ordered scale',
  'src/features/fitness/pages/Sleep.tsx':
    'sleep band scale — its "good" is purple, not a status green',
  'src/features/social/ReelsView.tsx':
    'platform-convention affordance colours',
};

/** #abc, #abcdef, #abcdef12 — never an HTML entity, never a hashtag. */
const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;

describe('Relief stays a system', () => {
  /**
   * NO SCREEN PICKS ITS OWN COLOURS.
   *
   * This is the one that took 918 edits to make true, and it is one careless
   * `color: '#2e7d32'` away from stopping being true. The failure it prevents
   * is not ugliness — it is that a screen with its own greens looks correct
   * today and is the only screen that does not change tomorrow.
   */
  it('has no hard-coded colour left in any page', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      if (file in COLOUR_IS_DATA) continue;
      const found = [...new Set(stripTs(read(file)).match(HEX) ?? [])];
      if (found.length) offenders.push(`${file} → ${found.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * EVERY EXEMPTION IS SPENT.
   *
   * An allow-list nobody prunes becomes a list of files nobody looks at. If a
   * file on it stops containing literals, it stops needing an exemption, and
   * carrying a dead one teaches the next person that the list is decorative.
   */
  it('keeps no exemption it is no longer using', () => {
    const dead = Object.keys(COLOUR_IS_DATA).filter(
      (f) => !new RegExp(HEX.source).test(stripTs(read(f))),
    );
    expect(dead).toEqual([]);
  });

  /**
   * FIVE DEPTHS, AND THERE IS NO SIXTH.
   *
   * A stylesheet that writes its own `0 4px 12px rgba(...)` is not adding a
   * shadow, it is adding a sixth depth — and depth is the whole language here,
   * because a monochrome design has no colour left to say "this is above that"
   * with. The exceptions below are the four places a raw shadow is the correct
   * answer, and each is named.
   */
  it('draws every surface at one of the five depths', () => {
    // The five depths, plus the four EDGES — a hairline's white underline, the
    // darker line under a table head, and the two pip halos. Nothing stands on
    // an edge, so an edge is not a depth; naming them is what lets the rule
    // above stay literally true instead of true-with-a-list-of-exceptions.
    // A DEPTH TOKEN, NOT MERELY A RIM. --rim is the hairline that sits on top of
    // a depth, not a depth itself, and while it counted here any hand-written
    // shadow beginning `var(--rim), 0 2px 4px …` passed unread — which is
    // exactly how three bespoke header shadows got in. It is no longer enough
    // on its own.
    // THREE MATERIAL SHADOWS FOR THE CHAT STAGE, and the company they keep
    // here is the argument. --glass, --lens, --lamp and --prism are already on
    // this list and none of them is an elevation either: they are what a
    // SURFACE is made of, added when a hub earned a material. The chat stage
    // is the same kind of thing — an incoming message is a white tile pressed
    // INTO the surface and an outgoing one is a black tile raised off it, and
    // "pressed in" is not a sixth height, it is a way of being made.
    //
    // They are named rather than hand-written for the reason the whole rule
    // exists: written inline, `inset 5px 5px 11px …` in one component and
    // `inset 6px 6px 12px …` in the next is two materials that look like one
    // mistake, and nothing would ever say so.
    // --glass-dock joins for the phone dock (9 Aug): the frosted capsule the
    // bottom bar floats in. A material like --glass — outer fall + contact +
    // lit hairline + frosted glow is what the glass IS, not how high it sits.
    // --atmos-lip joins for the medical atmosphere: the lit top rim that makes
    // a smoked pane read as glass instead of a brown box. It is one inset
    // hairline of light — a way of being made, like --soft-in, not a height.
    // --press-stamp and --press-stamp-warm join for the day's two sheets. A
    // menu card is STAMPED: the panel is pressed into the paper. Every layer of
    // both is inset. They are materials, in the company of --glass and
    // --soft-in, not a sixth height.
    //
    // --press-recto-lift and --press-verso-lift are EDGES and join the four
    // already named above: a scored rule is the cut plus the light caught on
    // its lower lip, and nothing stands on it. They are per-sheet because the
    // light on Thursday's blue is white and the light on Sunday's linen is not,
    // which is the whole reason a scored line reads as a crease on both.
    const NAMED = /var\(--(e1|e2|e3|e1-key|e2-key|carve|carve-deep|press|shadow|shadow-deep|edge-up|edge-in|pip|pip-ok|case-rim|case-rim-soft|lens|lens-key|lamp|lamp-badge|key-lit|key-lit-pip|rail-well-shadow|glass|glass-key|glass-in|glass-tray-shadow|glass-bubble-shadow|prism|focus-ring|soft-in|soft-tile|atmos-lip|press-stamp|press-stamp-warm|press-recto-lift|press-verso-lift)\)/;
    // A photograph, a filled black button and a text emboss are not surfaces —
    // they are ink and images, and they carry their own light.
    const ALLOWED = /(text-shadow|drop-shadow|\.hero|\.btn-accent|\.btn-gold|\.btn-primary|\.ask-cta|\.step\.|\.mincal|\.tag\.dark|\.knob|outline|inset 0 1px 0|no-case|img:not|video:not|\.case)/;
    const offenders: string[] = [];
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index], ['mira.css', mira], ['social.css', social]] as const) {
      for (const block of strip(css).split('}')) {
        const selector = block.split('{')[0].trim();
        const body = block.split('{')[1];
        if (!body) continue;
        for (const decl of body.split(';')) {
          if (!/^\s*box-shadow\s*:/.test(decl)) continue;
          if (NAMED.test(decl) || /:\s*none/.test(decl)) continue;
          if (ALLOWED.test(selector) || ALLOWED.test(decl)) continue;
          offenders.push(`${name} — ${selector} {${decl.trim()}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * COLOUR LIVES IN tokens.css AND NOWHERE ELSE.
   *
   * The material stylesheets are achromatic by construction: a lit face, a
   * white edge, a grey well. Every hex in them has its three channels equal.
   * The moment a chromatic literal appears in relief.css or index.css it is a
   * colour decision made in the wrong file — and it is the kind that survives
   * a repaint, because whoever repaints looks at tokens.css.
   *
   * tokens.css is exempt. It is where the hub accents and the status inks are
   * supposed to be.
   */
  it('keeps every colour decision in the token file', () => {
    const chromatic = (hex: string) => {
      let h = hex.slice(1);
      if (h.length === 3) h = [...h].map((c) => c + c).join('');
      return !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6));
    };
    const offenders: string[] = [];
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index], ['mira.css', mira], ['social.css', social]] as const) {
      for (const hex of new Set(strip(css).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])) {
        if (chromatic(hex)) offenders.push(`${name} → ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE GROUND IS WHITE — EVERYWHERE THE ROOT DECIDES IT.
   *
   * --paper and --card are the ground. If either stops being white AT THE ROOT
   * the page splits into two tones again and every relief in the application
   * loses the thing it is measured against.
   *
   * The `:root` slice is taken deliberately. Asserting against the whole file
   * would have kept passing the moment a hub re-pointed the ground in its own
   * block — `toMatch` only needs the string to survive SOMEWHERE — and a guard
   * that cannot fail is worse than no guard, because it is read as proof.
   */
  /**
   * IT SAID "WHITE" AND IT MEANS SOMETHING NARROWER NOW (23 Aug). The owner's
   * reference is near-white paper with a white card on it — two greys, which
   * is the whole of what that kind of magazine does with a page. So --paper is
   * #fafafa and --card is still #ffffff, and asserting "#ffffff three times"
   * would now be asserting the thing that changed rather than the thing that
   * matters.
   *
   * WHAT MATTERS IS THE RELATIONSHIP, and it is stricter than the old check:
   * the page is not pure white, the card is, and the card is LIGHTER than the
   * page — which is what makes a card read as a sheet resting on something
   * rather than a hole cut in it. Get any of those backwards and the relief
   * system is lighting an object from the wrong side.
   */
  it('keeps one near-white page and a lighter card at the root', () => {
    const root = strip(tokens).split(/\[data-hub=/)[0];
    const val = (t: string) => root.match(new RegExp(`${t}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ground = val('--ground')!, paper = val('--paper')!, card = val('--card')!;
    expect({ ground, paper }).toEqual({ ground: paper, paper });   // one page, one value
    expect(paper).not.toBe('#ffffff');                             // near-white, not white
    expect(card).toBe('#ffffff');
    expect(lum(card)).toBeGreaterThan(lum(paper));                 // a sheet ON the page
    expect(strip(tokens)).not.toContain('[data-theme="dark"]');
  });

  /**
   * A HUB'S OWN GROUND IS SCOPED OR IT IS NOT AN EXCEPTION.
   *
   * (This heading and the count below said THREE for as long as three held
   * one. Five do — the list at GRANTED is the authority, and it has been
   * right the whole time; only the prose around it went stale.)
   *
   * THE CITY IS BLACK AND WHITE, AND EACH HUB OWNS ONE COLOUR: the lit key
   * in its rail. Hue is spent where hue is the only thing that works —
   * twenty-five rooms, and one object that says which you are standing in
   * before a word is read. Everything else is inherited.
   *
   * Which makes a GROUND grant the rarest thing in the system. FIVE hubs hold
   * one; four have handed one back in a day. The returns are the same rule
   * running the other way — a hub holds a ground when words are read off
   * something that is not the city's white, and gives it back the moment that
   * stops being true. What is left is the two cases that rule cannot cover: a
   * room that is dark on purpose, and a room whose MERCHANDISE is white.
   *
   *   nutrition — RETURNED, and the return is the cleanest of the three. Its
   *     grant was warm paper, argued on the press: a day of food is read the
   *     way a menu is, and the recipe pages had become an ivory island inside
   *     a white hub. Still true, still handled — the press keeps its own
   *     granted surface, and at :root that surface is white, so the island
   *     and the sea now match by inheritance rather than by two palettes
   *     agreeing. A hub does not have to be ivory for a press to be a press.
   *   astrology — near-black, and this entry has been rewritten three times in
   *     one day, which is worth recording rather than tidying away. It held a
   *     grant for the gold-on-charcoal photographs, held it again for the
   *     velvet, RETURNED it for the daylight observatory (white is the city's
   *     own ground, so the permit was for nothing), and takes it back here for
   *     the monochrome night. The through-line is not indecision, it is the
   *     one rule this test exists to enforce: a hub holds a ground grant when
   *     words are read off something that is not the city's white, and gives
   *     it back the moment that stops being true. Daylight gave it back
   *     honestly. Near-black earns it the way the first night did — and this
   *     time with no metal in the room at all, which is the argument BELOW
   *     about the lamp.
   *   entertainment — dark. Owner's call, and the argument is the same shape as
   *     the other two: it is a hub you READ. Every surface the job of deciding
   *     what to watch exists on — a cinema, a television, a phone at midnight —
   *     is dark with the picture as the only lit thing, and a grid of film
   *     posters on white is a catalogue rather than a screen. Its accent hue is
   *     NOT the ground either: the ground is near-black, the green stays in the
   *     fill and in the readable ink.
   *   beauty — A GALLERY WALL, and it is the first grant in this file to
   *     re-point TWO surfaces rather than one. The ground is near-black,
   *     grained and vignetted — the owner's backdrop photograph — and the paper
   *     is cream. Every plate, card, field and photograph is the paper; the
   *     wall is only ever behind them.
   *
   *     THE ARGUMENT IS THE ONE THE THREE RETURNS BELOW DO NOT ANSWER. Social
   *     and dating both asked for a tint to hold photographs and both were
   *     refused with the same sentence: a wall of pictures on white is a
   *     contact sheet, and a contact sheet is fixed by CASING and SPACE rather
   *     than by colour. That refusal stands, and relief.css cases every image
   *     in the city so it is enforced.
   *
   *     It does not reach this hub, because the problem here is not DENSITY,
   *     it is VALUE. Skincare is photographed cut-out — a white cream, an ivory
   *     balm, a translucent gel; the owner's first reference is three near-white
   *     smears and nothing else in the frame. Those pictures are `.no-case` of
   *     necessity (an outline drawn round a cut-out is an outline round
   *     nothing) and they are the same VALUE as the city's paper. A cased
   *     portrait on white loses its frame and gets it back from the case. An
   *     uncased white cream on white loses the CREAM, and no amount of air
   *     returns it — the more space you give a near-white jar on white, the
   *     more of nothing there is around it.
   *
   *     THE GROUND WENT DOWN IN TWO STEPS AND THE FIRST IS WORTH KEEPING. It
   *     was warm sand for an afternoon, on exactly this argument, and sand
   *     answers it: a cream jar has an edge on it. The owner then supplied the
   *     backdrop, and near-black answers the same argument completely rather
   *     than adequately — which is the honest reason the value moved, and the
   *     reason this entry is not a second decision.
   *
   *     AND THE HUE IS STILL NOT THE GROUND. Near-black is not beauty's
   *     magenta; the magenta is in the rail's lit key and nowhere else, exactly
   *     as charcoal keeps its gold in the fill and the dark room its green. A
   *     hub asking for "a wall like beauty's" in its own colour is asking for
   *     the removed nutrition tint, not for this.
   *
   *     WHAT IT COSTS, WRITTEN DOWN. Two grounds means two ink scales, and the
   *     second one is the one nobody screenshots — a heading, a tab rule, an
   *     index between two plates. The assertion below measures both. The five
   *     depths are inherited untouched: the prints are lit from above on a dark
   *     wall exactly as they are on a white one, which is why this grant needed
   *     no inverted relief and entertainment's did.
   *   social — RETURNED. Its grant was the hardest of the three to give back
   *     and it still went. The argument was MATERIAL, twice: clear glass on
   *     white "has nothing behind it to bend", and a wall of other people's
   *     photographs on white is a contact sheet. Both were true and neither
   *     needed a tint. The glass had already been built OPAQUE — ground
   *     glass, not the transparent kind — precisely because white gave it
   *     nothing to bend, so it was never waiting on the ground that arrived.
   *     And the contact sheet is answered by casing the pictures and
   *     spending space around them, which is composition. A tinted ground
   *     was the expensive answer to two problems that had cheaper ones.
   *   dating — HELD one three times (candy, then the studio's greige) and
   *     RETURNED it, for the same reason astrology's daylight did. Its
   *     argument had always been material: photographs on white read as a
   *     contact sheet, so the room was tinted to give six faces a week
   *     something to sit in. What the owner's Swiss reference showed is that
   *     the tint was never the load-bearing half of that argument — SPACE and
   *     a GRADE were. Greyscale the photographs, spend enough air, and white
   *     paper stops being a contact sheet and becomes a gallery wall. So the
   *     hue went, and the ground with it: near-black ink on the city's own
   *     white, five soft depths doing all the separating, and the grade
   *     (still the only one in the city) taken to its third stop. The film
   *     that was this grant's original justification is precisely what let it
   *     be given back.
   *
   * THE ACCENT HUE IS NEVER THE GROUND. The tint that was removed washed the
   * page in the hub's GREEN. None of these does that: paper with the green
   * left in the fill, charcoal with the gold left in the fill, candy with the
   * blue left in the fill. A sixth hub asking for "a tint like nutrition's" is
   * asking for the removed thing, not for any of these, and gets its own line
   * here or nothing. Beauty's wall is achromatic, so it is not even close: the
   * removed tint was the hub's GREEN washed over the page, and beauty's magenta
   * appears nowhere below the rail.
   *
   * The list is written out rather than counted, exactly like the press's
   * wearers, so a fourth entry costs an argument instead of a nod.
   */
  it('keeps a re-pointed ground inside the five hubs it was granted to', () => {
    const css = strip(tokens);
    /**
     * DATING IS THE FOURTH, SINCE 20 AUG, AND THE ARGUMENT IS WRITTEN HERE
     * BECAUSE THE COMMENT ABOVE SAYS A GRANT COSTS ONE.
     *
     * The rule this list enforces has never been "three hubs". It is: a hub
     * holds a ground when words are read off something that is not the city's
     * white, and hands it back the moment that stops being true. Dating has
     * been on both sides of that sentence — it took a ground for the candy
     * room, gave it back for the monochrome pass, and takes one again now
     * that the room is Crimson Velvet (#2C0F12 to #6B1E23, owner's
     * reference). Words in it are read off crimson panels on a crimson wall.
     *
     * A HUB THAT HANGS ONLY A SKY IS STILL NOT ON THIS LIST, and that
     * distinction is the reason the list is worth keeping. Nutrition,
     * Financial and Social hang a picture BEHIND white panels; their text is
     * still read off the city's white. This is four hubs whose PAPER is not
     * white, which is a different and much rarer thing.
     */
    /* NUTRITION IS THE FIFTH, SINCE 21 AUG. Same sentence as dating's above:
     * its words are read off green panels in a green room now. This hub has
     * been on both sides of that rule more than once — it is the churn, not
     * the rule, that is unusual here. */
    /* AND DATING LEFT IT, 23 AUG — the first hub ever to. Owner's reference
     * was a photograph of white porcelain, which is not a palette but the
     * city's own white; the rule above says a hub hands its ground back the
     * moment its words stop being read off something else, and that is what
     * this is. Its block in tokens.css is one token now (--film, the greyscale
     * portraits, which were never about the ground) and one token is not a
     * ground, so assertion 1 below no longer counts it. The list going DOWN is
     * the rule working. */
    /* AND THEN IT EMPTIED, 23 AUG. Dating left in the morning; the other four
     * went the same afternoon on one instruction — the same colour rule in
     * every hub. The rule above is unchanged and it is the reason: a hub holds
     * a ground when its words are read off something that is not the city's
     * paper, and no hub's are, because the city's paper is the reference's
     * near-white and every room is on it.
     *
     * ENTERTAINMENT IS THE ONE WITH A STANDING COUNTER-ARGUMENT, written out
     * in tokens.css where its block used to be rather than left to be
     * rediscovered: a grid of film posters on white is a catalogue, on black
     * it is a screen. That is not wrong. It lost to a larger instruction, and
     * it is one block to put back.
     *
     * AN EMPTY LIST IS NOT A DEAD GUARD. Clause 1 reads it as "these and no
     * others", so at zero it says NO hub may re-point a ground — stronger than
     * anything it has said before. */
    const GRANTED: string[] = [];

    // 1. only the granted hubs re-point a ground token. Sorted: the file's
    //    order is editorial and a re-order must not read as a breach.
    const blocks = [...css.matchAll(/\[data-hub="([a-z]+)"\][^{]*\{([^}]*)\}/g)];
    const grounded = blocks
      .filter(([, , body]) => /--(ground|paper|card|wash|rail-well)\s*:/.test(body))
      .map(([, hub]) => hub);
    expect([...new Set(grounded)].sort()).toEqual(GRANTED);

    // 2. they re-point depths and invent none. Five depths, no sixth — a scope
    //    may change what a depth is MADE OF, never how many there are.
    const rootNames = new Set([...css.split(/\[data-hub=/)[0].matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const hub of GRANTED) {
      const body = blocks.filter(([, h]) => h === hub).map(([, , b]) => b).join(' ');
      const declared = [...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
      expect({ hub, invented: declared.filter((n) => !rootNames.has(n)) })
        .toEqual({ hub, invented: [] });
    }

    // 3. and a ground is only ever reached through the hub attribute — never
    //    pinned to a page, which is how a scope quietly becomes a default.
    const wearers = PAGES.filter((f) =>
      /data-hub=["'](nutrition|astrology|beauty|entertainment)["']/.test(stripTs(read(f))));
    expect(wearers).toEqual([]);
  });

  /**
   * AND EVERY INK A RE-POINTED GROUND DECLARES IS READABLE ON IT — COMPUTED.
   *
   * The three grants above check that a hub re-points the right SET of tokens.
   * Nothing checked what it re-points them TO. Entertainment's palette was
   * lifted off a screenshot, and a screenshot has not been checked by anybody;
   * "it looks fine on my monitor" is how a hub ships with 3:1 metadata that
   * nobody outside the room can read.
   *
   * So the ratio is arithmetic here rather than judgement. --faint is the one
   * worth watching: it is the floor of the scale (labels, placeholders,
   * timestamps) and it is where a hand-picked dark palette usually fails.
   */
  it('clears AA for every ink each grounded hub declares', () => {
    const css = strip(tokens);
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const failures: string[] = [];
    /* THE SAME LIST AS THE GRANT ABOVE, AND IT IS EMPTY TODAY — so this loop
       runs zero times, which is correct rather than broken: nothing re-points
       a ground, so there is nothing to measure. It is written out again rather
       than shared because the two assertions are allowed to disagree about
       WHEN they check, never about WHICH hubs — and a day when they disagree
       is a day somebody should have to edit both.

       It is kept, and kept accurate, because the day a hub takes a ground back
       this is the arithmetic that must run on it, and a guard deleted the day
       it goes quiet is a guard nobody writes again. */
    const GROUNDED: string[] = [];
    for (const hub of GROUNDED) {
      // The block that owns the ground, found by the thing that makes it that
      // block rather than by position: nutrition and entertainment each once
      // had a plain accent one-liner elsewhere in the file, and matching the
      // first occurrence reads a palette out of the wrong one.
      const body = [...css.matchAll(new RegExp(`\\[data-hub="${hub}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'g'))]
        .map((m) => m[1]).find((b) => /--paper:/.test(b));
      expect({ hub, found: Boolean(body) }).toEqual({ hub, found: true });
      /**
       * ONE HOP THROUGH A `var()`, BECAUSE `if (!ink) continue` IS A DOOR.
       *
       * This read hexes only, and skipped anything it could not parse — so
       * `--ink: var(--on-paper)` un-checked the whole ink scale of a hub and
       * the suite went green. Beauty writes exactly that, for a real reason
       * (the wall re-points --ink inside .tc-main, and a card can only put the
       * paper's value back under a name that was not shadowed), and the first
       * version of this file shipped its four greys unmeasured.
       *
       * One hop is enough for that and stops short of an evaluator: a chain
       * two deep is a palette nobody can read either.
       */
      const raw = (n: string) => body!.match(new RegExp(`${n}:\\s*([^;]+);`, 'i'))?.[1]?.trim();
      const val = (n: string): string | undefined => {
        const v = raw(n);
        if (!v) return undefined;
        if (/^#[0-9a-f]{6}$/i.test(v)) return v;
        const hop = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v)?.[1];
        const via = hop ? raw(hop) : undefined;
        return via && /^#[0-9a-f]{6}$/i.test(via) ? via : undefined;
      };
      const page = val('--paper')!, card = val('--card') ?? page;
      /**
       * AND A SECOND GROUND, FOR THE HUB THAT HAS ONE.
       *
       * Every grant before Beauty re-pointed one ground: the page and the card
       * were the same material a step apart, so --paper was the only surface
       * text was read on. The gallery wall is near-black behind cream prints,
       * and the ink drawn straight onto it is a different scale entirely. A hub
       * with two grounds and one checked ground is a hub with an unchecked
       * ground — and it is the one nobody screenshots, because the text on it
       * is a heading and a tab rule rather than a card full of content.
       */
      const wall = val('--ground');
      const CHECKS: [name: string, on: string | undefined][] = [
        ['--ink', page], ['--ink-soft', card], ['--muted', page], ['--faint', page],
        ['--accent-ink', page], ['--ok-ink', page], ['--warn-ink', page],
        ['--danger-ink', page], ['--info-ink', page],
        ['--on-ground', wall], ['--on-ground-soft', wall], ['--on-ground-muted', wall],
      ];
      for (const [name, ground] of CHECKS) {
        const ink = val(name);
        if (!ink) continue;                       // not re-pointed is not a failure
        if (!ground) { failures.push(`${hub} ${name} declared with no ground to read it on`); continue; }
        const r = ratio(ink, ground);
        if (r < 4.5) failures.push(`${hub} ${name} at ${r.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * AND EVERY SKY IS READABLE AT EVERY STOP — COMPUTED, PER HUB.
   *
   * THE GUARD ABOVE CANNOT SEE A GRADIENT, AND FIVE HUBS NOW HANG ONE. It
   * measures a hub's ink against `--paper`, which is a hex; a sky is seven
   * hexes on a token the AA machinery has never read. So a hub can hang a
   * picture its own ink cannot be read on and pass every test in this file —
   * and the failure is invisible to whoever ships it, because a gradient is
   * legible at the stop they happen to have on screen and not at the one at the
   * other end. That is the exact shape of the bug the ink scales were checked
   * for in the first place, arriving through a token nobody thought of as a
   * ground.
   *
   * IT WAS FOUR HUBS OF ARITHMETIC IN COMMENTS. Dating held its sky's head
   * light for the breadcrumb; Financial lifted its whole sage off the reference
   * until dark ink cleared it; Beauty measured 10.89 and declared nothing had
   * to move; Entertainment darkened one corner by a fifth for the opposite
   * reason. Every one of those is a real measurement and not one of them was
   * checked by anything. A number in a comment is a claim about the file as it
   * was the afternoon somebody typed it.
   *
   * --ink AND --ink-soft, AND NOT THE WHOLE SCALE, and the boundary is dating's
   * own sentence rather than a convenience: "anything drawn bare on the sky
   * takes --ink or --ink-soft". --muted and --faint are shadowed on `.tc-main`
   * in three of these hubs precisely BECAUSE they fail out in the open, so
   * requiring them here would fail the hubs that already did the right thing.
   * --accent-ink is out for the same reason and it is worth naming: dating's
   * peach reads 2.51 on its own dusk and is correct, because it appears only
   * inside a panel. What this measures is the set that has no panel to hide in.
   */
  /* ── THE SKY SWEEP WAS HERE, AND IT IS DELETED (23 Aug) ────────────────
     It measured --ink and --ink-soft against every stop of every hub's
     --sky-image. There are no skies: the last came down when the ink went from
     #000000 to the reference's #2a2a2a, because a soft ink cannot be read bare
     on a gradient — and this guard is what proved it, failing in ten places
     the moment the ink moved.

     ITS OWN LAST INSTRUCTION IS WHY IT GOES RATHER THAN STAYING GREEN: "if the
     number ever reaches zero this guard is watching an empty road and should
     be deleted rather than left passing." It reached zero. A guard that cannot
     fail reads like coverage and is worse than none.

     TO WANT IT BACK: a hub hanging a picture behind its panels again. The
     arithmetic is four lines and it is in this file's history. */


  /**
   * AND THE ONE SHEET THE WEEK PRINTS ON IS READABLE AT EVERY STOP.
   *
   * This used to be fourteen photographs — two per weekday, in `[data-paper]`
   * blocks, each declaring a worst-pixel `-ground` hex because the average of a
   * photograph is a colour that appears nowhere in it. That system was retired
   * on 20 Aug: the week prints on `--press-sky`, one pale gradient, and the
   * day's identity is the weekday, the date and the day number.
   *
   * WHAT THE GUARD MEASURES NOW IS THE GRADIENT ITSELF, which is strictly
   * better than what it replaces. A hex somebody typed after opening a JPEG in
   * an editor is a CLAIM about an image — the old guard could recompute the
   * ratios but never verify the claim, which is why scripts/paper.mjs existed.
   * A gradient carries its stops in the token file. There is nothing left to
   * take on trust: every stop is read out of the CSS and every press ink is
   * measured against every one of them.
   *
   * `-ink-3` IS HELD TO 3:1 AND NOT 4.5, exactly as it is on white at 3.7:1:
   * it is the floor of the scale and it is for labels, eyebrows and metadata.
   * Nothing sets body copy in it. The other two are body text and take AA.
   *
   * AND NO PHOTOGRAPH COMES BACK BY THE OLD DOOR. The `[data-paper]` key is
   * gone from the token file and from both pages that used to set it; a rule
   * that re-declares a sheet as a `url()` is the exact drift this deletion was
   * for, so it fails here rather than being discovered on a phone.
   */
  it('clears AA at every stop of the sheet the week prints on', () => {
    const css = strip(tokens);
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const sky = css.match(/--press-sky:\s*linear-gradient\(([\s\S]*?)\);/)?.[1];
    expect(sky, '--press-sky is not declared in tokens.css').toBeTruthy();
    const stops = [...(sky ?? '').matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
    // A guard that finds nothing passes. A gradient is at least two colours.
    expect(stops.length).toBeGreaterThan(1);

    const inks: Array<[string, number]> = [['ink', 4.5], ['ink-2', 4.5], ['ink-3', 3]];
    const failures: string[] = [];
    for (const [name, floor] of inks) {
      const ink = css.match(new RegExp(`--press-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
      if (!ink) { failures.push(`--press-${name} not declared`); continue; }
      for (const stop of stops) {
        const r = ratio(ink, stop);
        if (r < floor) failures.push(`--press-${name} at ${r.toFixed(2)}:1 on ${stop} (needs ${floor})`);
      }
    }

    // The declared worst stop has to BE the worst stop, or every ratio quoted
    // beside it is a number about a colour the reader never sees.
    const worst = css.match(/--press-sky-worst:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase();
    expect(worst, '--press-sky-worst is not declared').toBeTruthy();
    const darkest = stops.reduce((a, b) => (lum(a) <= lum(b) ? a : b));
    if (worst !== darkest) failures.push(`--press-sky-worst is ${worst}, but the darkest stop is ${darkest}`);

    expect(failures).toEqual([]);
  });

  /**
   * AND A SHEET THAT PAINTS THE SKY MEASURES AGAINST THE SKY.
   *
   * FOUND BY LOOKING AT THE LIVE GROCERY LIST at 1.08:1 — a whole page of
   * fifty-seven items in mint on mint, unreadable, the same fault the meal
   * planner had and one commit AFTER it was fixed there.
   *
   * The cause is a name that means two things. `--press-ink` is green-black at
   * `:root`, for the mint sheet — and the forest grant re-points it to the
   * PAGE's light ink inside `[data-hub="nutrition"] .tc-main`, correctly, so
   * that press-dressed components standing on the dark page can be read.
   * `.press-recto` and `.press-verso` re-point it back for their own subtree.
   * `.grocery-sheet` paints the same sky and did NOT: it read the shadowed
   * name and got page ink on sheet paper.
   *
   * SO THE RULE IS STRUCTURAL, not a colour. Any block that paints
   * `--press-sky` is standing on mint, and mint takes the `:root` scale —
   * `--press-recto-*`, the literal one the AA guard above actually measures.
   * Reading `var(--press-ink*)` there is reading a name whose value depends on
   * which hub the sheet happens to be inside, which is the definition of a
   * colour that renders one thing and measures another.
   */
  it('lets no sheet on the sky take its ink from a shadowed name', () => {
    const css = strip(tokens);
    const offenders: string[] = [];

    for (const block of css.split('}')) {
      const selector = block.split('{')[0]?.trim();
      const body = block.split('{')[1];
      if (!body || !selector) continue;
      // The sheet is the sky: this block's surface is the pale mint gradient.
      if (!/--[\w-]*sheet(?:-img)?:\s*var\(--press-sky\)/.test(body)) continue;

      for (const decl of body.split(';')) {
        const [name, value] = decl.split(':');
        if (!name || !value) continue;
        if (!/var\(--press-ink(-[23])?\)|var\(--press-rule(-2)?\)|var\(--press-paper\)/.test(value)) continue;
        offenders.push(`${selector} { ${name.trim()}: ${value.trim()} }`);
      }
    }

    expect(
      offenders,
      'a sheet painted with --press-sky read a hub-shadowed press name; ' +
        'point it at the literal --press-recto-* scale instead',
    ).toEqual([]);
  });

  /**
   * AND THE CITY'S NAME IS LEGIBLE IN EVERY HUB.
   *
   * FOUND BY THE OWNER, TWICE, on two different headers — a black signature on
   * forest green and the same one on crimson velvet, 1.95:1 and 1.84:1.
   *
   * The wordmark is one black drawing. `.tc-logo .word` inverted it for
   * exactly one named hub, entertainment, which was the whole set of dark
   * skies on the day that line was written. Two hubs went dark afterwards and
   * neither edit walked back to a rule in a different file to say so. That is
   * the failure mode worth a guard: not a wrong colour, but a rule keyed on a
   * SET THAT CHANGES, maintained by remembering.
   *
   * So the set is computed instead of listed. Every hub declares its sky in
   * the token file; the lightest stop of that sky is the friendliest ground a
   * black signature will ever get, and if the signature fails AA even there,
   * the hub is dark and owes `--word-filter: invert(1)`. If it passes
   * comfortably, the hub is pale and must NOT invert — white on near-white is
   * the same bug with the polarity swapped, and it is how astrology broke the
   * last time this was a list.
   */
  /**
   * ── AND THE SIGNATURE IS NEVER INVERTED, BECAUSE NO ROOM IS DARK ──────────
   *
   * This measured a black wordmark against the lightest stop of each hub's sky
   * and required `--word-filter: invert(1)` exactly where that failed. There
   * are no skies and no dark rooms.
   *
   * IT IS NARROWED RATHER THAN DELETED, and the difference from the sweep above
   * is that this one still has a subject: `--word-filter` exists, it is `none`,
   * and the failure it guards — a white wordmark on white paper, which is how
   * astrology broke the last time this was a list — is one hub block away from
   * happening again. The claim goes from "inverted in the right places" to
   * "inverted nowhere", which is the true one now.
   */
  it('never inverts the signature, because no room is dark', () => {
    const css = strip(tokens);
    expect(css, '--word-filter is not declared at :root').toMatch(/--word-filter:\s*none/);
    const inverting = [...css.matchAll(/\[data-hub="([a-z]+)"\][^{]*\{([^}]*)\}/g)]
      .filter((m) => /--word-filter:\s*invert\(1\)/.test(m[2])).map((m) => m[1]);
    expect(inverting).toEqual([]);
  });


  /**
   * AND NOTHING PAINTS THE WORDMARK THROUGH A NODE THAT ISN'T THERE.
   *
   * The first attempt at a white name in dating set `fill` and `color` on
   * `.tc-logo svg` and `.tc-logo svg *`. The wordmark is an `<img src=".svg">`
   * — an external document, with no inline `<svg>` in the page for either
   * selector to reach. The rule was valid CSS, matched zero nodes, broke
   * nothing, and shipped; the name stayed black for three days.
   *
   * A rule that cannot match is worse than a wrong one, because a wrong one
   * shows. This is cheap to check and the mistake is easy to repeat.
   */
  it('paints the wordmark on a node that exists', () => {
    expect(strip(relief)).not.toMatch(/\.tc-logo\s+svg/);
  });

  it('lets no photograph back onto the week', () => {
    const css = strip(tokens);
    // The key itself is gone. A block keyed on it is somebody restoring the
    // thirteen papers from an old commit rather than making the argument.
    expect(css).not.toMatch(/\[data-paper=/);
    // And no sheet token names a file, on any selector.
    expect(css.match(/--press-\w+-sheet:\s*url\([^)]*\)/g) ?? []).toEqual([]);
  });

  /**
   * AND NO SURFACE LITERAL RETURNS TO THE MATERIAL FILE.
   *
   * `keeps every colour decision in the token file` only fails on CHROMATIC
   * hexes, so four achromatic ones lived in relief.css unseen: the loud
   * button's black gradient, the outline button's white top edge, and two
   * frosted white overlays. On white all four are correct and unremarkable.
   * On a ground that is not white the loud button becomes the quietest thing
   * on the page and every modal drops a white sheet over a dark room — bugs
   * you find by screenshotting, not by reading.
   */
  it('leaves no surface literal in the material file, achromatic or not', () => {
    const offenders: string[] = [];
    for (const block of strip(relief).split('}')) {
      const [selector, body] = [block.split('{')[0]?.trim(), block.split('{')[1]];
      if (!body) continue;
      // A photograph's own scrim, ::selection and a hero's glass sit ON an
      // image rather than on the ground, so they do not follow it. Named,
      // because a wider rule is how the four literals happened.
      if (/::selection|\.hero|\.scrim|\.mvk|no-case|\.av-strip/.test(selector)) continue;
      for (const decl of body.split(';')) {
        if (!/^\s*background(-color)?\s*:/.test(decl)) continue;
        if (/#(fff|ffffff|000|000000)\b|rgba\(255,\s*255,\s*255/.test(decl)) {
          offenders.push(`${selector} {${decl.trim()}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A ROOM WITH ITS OWN LIGHT STILL OWES ITS FURNITURE AN INK.
   *
   * THE NIGHT THIS TEST WAS WRITTEN AROUND IS GONE — owner, 18 Aug. The
   * observatory wore a dark palette twice: once as the whole hub, then scoped
   * to the header and the rail as the furniture around a lit page. Both are
   * removed, because the hub now hangs a sheet of light and its chrome floats
   * on it in frost, and the night's ink computed 1.03:1 there.
   *
   * SO WHY IS THIS TEST STILL HERE, AND WHY IS IT LONGER. Because only ONE of
   * its four clauses was about the night. The other three are invariants about
   * a hub that re-points a ground, and deleting the test with the palette would
   * have thrown them away for a reason that has nothing to do with them — the
   * exact move that loses a guard silently. The clause that WAS about the night
   * has been replaced by the thing it was really protecting, and the
   * replacement is stronger than the original.
   *
   * 1. THE ROOM CARRIES ITS OWN INK. Ink, ground and the readable accent are
   *    re-pointed together or the "Birth Details" failure comes back: a colour
   *    and its background becoming the same colour, which nothing else here
   *    can see.
   *
   * 1b. AND ITS RAIL IS READABLE, WHICH IS THE CLAUSE THAT CHANGED. It used to
   *    read "a hub that re-points --paper MUST re-point --rail-well", because
   *    the rail's labels take --ink and --faint and a white well under
   *    near-white text is the hub name gone. That was the SHAPE of the fix, not
   *    the requirement — and it fails open the moment a hub's answer is to have
   *    dark ink instead, which is this hub's answer now. So the requirement is
   *    written directly and computed: re-point the well, or prove the ink you
   *    kept is legible on the well you did not. A hub can no longer satisfy
   *    this by declaring --rail-well and putting the wrong ink on it either.
   *
   * 2. --on-accent IS STILL THE CITY'S. It is read by SEVEN dark surfaces:
   *    the black primary button, .tag.dark, the mini-calendar's today, the
   *    media bar, the lit glass key, and the rail lamp's label and badge.
   *    Re-pointing it for one hub turns the black button's own label black —
   *    not a contrast regression, an invisible button, and no test outside
   *    this one would see it.
   *
   * 3. AND IF THE LAMP LEAVES, ITS INK GOES WITH IT. The failure mode was
   *    never "the lamp changed colour", it was "the lamp changed and its label
   *    did not" — white type on a white pill, and a rail whose current room is
   *    unreadable. This hub touches neither now, so the clause holds vacuously;
   *    it is kept because the next hub to try monochrome will reach for exactly
   *    this and the precedent is what makes it cheap.
   *
   * 4. NO SURFACE HARDCODES ITS OWN LIGHT GROUND, AND NO THEME SWITCH
   *    RETURNS. `.btn-secondary` was `background: #fff` under a label that
   *    follows the room — achromatic, so the colour guard allowed it, and
   *    invisible-by-luck on white; on a night ground it is a control you can
   *    neither read nor see.
   */
  /* ── THE OBSERVATORY'S INK WAS CHECKED HERE, AND ITS SUBJECT IS GONE ───
     Astrology held a ground — cream paper, a photographed letter, its own ink
     scale, a rail measured against the sky's darkest stop — and this verified
     every ratio in it. The hub handed that ground back on 23 Aug with the
     other three, so there is no astrology palette left to measure.

     THE ARITHMETIC IS NOT LOST: the generic AA sweep above does exactly this
     for any hub that holds a ground, computed rather than hand-written, and it
     runs the moment one does again. That guard replacing this one is why this
     is a deletion and not a gap.

     `.letter-page` still keeps its own photographed paper and ink — a surface
     inside the hub rather than the hub — and letter-surface.test.ts holds it. */


  /**
   * DARK MODE IS GONE, NOT HALF-GONE.
   *
   * A theme store nobody imports still sets data-theme on <html> the moment
   * one lazy chunk loads. Half-removed, it would repaint a handful of screens
   * on a page nobody expected — which is worse than either keeping it or
   * removing it.
   */
  it('has no theme switch left anywhere', () => {
    const survivors = PAGES.filter((f) => /useThemeStore|theme\.store|data-theme/.test(stripTs(read(f))));
    expect(survivors).toEqual([]);
  });

  /**
   * ONE TYPEFACE.
   *
   * --serif and --mono still exist because a few dozen call sites read them.
   * They must resolve to the same family: the moment one of them names a real
   * second font, a heading changes typeface halfway down a page and nobody can
   * say which screen did it.
   */
  it('resolves every font token to the one family', () => {
    expect(strip(tokens)).toMatch(/--serif:\s*var\(--sans\)/);
    expect(strip(tokens)).toMatch(/--mono:\s*var\(--sans\)/);
    expect(strip(tokens)).toMatch(/--sans:\s*'General Sans'/);
    const families = [...stripFaces(strip(relief)).matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
    const foreign = families.filter((f) =>
      !/var\(--(sans|serif|mono)\)|inherit|'General Sans'/.test(f)
      // THE PRESS. Two faces exist for the nutrition day and nowhere else. The
      // exception is named in tokens.css with its reason; the test below is
      // what makes it an exception rather than a drift, because it proves
      // nothing outside [data-press] can reach them.
      && !/var\(--press-(serif|mono)\)/.test(f));
    expect(foreign).toEqual([]);
  });

  /**
   * THE EXCEPTION IS SCOPED, OR IT IS NOT AN EXCEPTION.
   *
   * A second and third typeface were allowed into this application exactly
   * once, for one page, because a meal plan is read the way a menu is read.
   * That argument holds for the nutrition day and for nothing else — and the
   * way a rule like this dies is not a decision, it is a second page picking
   * up one of the three broken rules because the class was simply there.
   *
   * So: every press face, every press colour and every press class must sit
   * behind `[data-press]` or start with `press-`, and the list of screens that
   * switch it on is written out below rather than counted.
   *
   * THE SECOND WEARER IS THE SAME DAY, BUILT BY HAND. OwnDayView renders the
   * citizen's own dishes for a day, and it was asked for explicitly so that a
   * day you compose is read on the same paper as the day the engine composed —
   * one meal plan, two authors. That is the argument, and it is the only one
   * accepted so far: a third entry needs its own line here and its own reason,
   * not a nod to this one.
   *
   * THE THIRD WEARER IS THE RECIPE ITSELF, AND ITS REASON IS NOT THE PLAN'S.
   * The plan argued that a day of food is read the way a menu is read. A single
   * recipe is read the way a RECIPE CARD is read, which is a different printed
   * form and an older one: the dish set as a display line, the quantities in a
   * column that aligns, and — the part no card in this application could do —
   * what to buy and what to do standing SIDE BY SIDE, because that is how you
   * cook from a page. It was a stack of nine rounded cards before, and the two
   * columns you actually use were the third and the fourth of them.
   *
   * It takes the press's paper unchanged, deliberately. The printed cards this
   * was drawn from are cream, and giving this one page a warm ground was the
   * obvious move and the wrong one — OwnDayView was granted the press exactly
   * so that two authors of the same day print on the same paper, and a third
   * surface with its own would have spent that on a tint.
   *
   * ── AND A FOURTH WEARER OF THE FACE ONLY, WHICH IS A DIFFERENT GRANT ──────
   *
   * `.letter-title` — the astrology daily and monthly letter — reads
   * `--press-serif` and NOTHING else of the press. Not the mono, not the
   * paper, not one press- class. The reason is not the menu argument and not
   * the recipe-card argument: a letter has a TITLE, one line, set large, and
   * this application owns exactly one display face capable of setting one. The
   * alternative was a fourth font file for a single line of text on two pages.
   *
   * That makes it a narrower grant than the three above and it is checked more
   * narrowly too — assertion 4 names the selector allowed to borrow the face
   * and fails on anything else. It is ONE selector with three places in it,
   * deliberately, and they are not three decisions: `.letter-title` and the
   * same title listed in the archive are the same object on two surfaces, and
   * `.beauty-display` is the beauty hub's editorial title, from the reference
   * the owner supplied, whose whole character is this face against the sans.
   * Setting it once is what stops the three drifting apart. The three press
   * wearers are listed by FILE because they switch a whole surface on; this one
   * is listed by SELECTOR because it borrows a typeface. If a fifth thing wants
   * the serif it needs its own line here, its own reason, and its own entry in
   * that list.
   *
   * IT WAS `.routine-display` AND THE RENAME IS THE POINT, not tidying. It was
   * named after the first page that needed it — the routine sheet's masthead —
   * and then the owner's poster reference arrived for the skin & hair page: four
   * plates, each with one display title, in the same hub, from the same
   * reference. Asking for a sixth grant called `.beauty-plate-title` would have
   * been asking for permission to do the thing this one already permits. ONE HUB
   * GETS ONE DISPLAY CLASS, and the grant is written at the hub rather than at
   * whichever page happened to reach for it first.
   *
   * The class is the FACE and nothing else — every wearer sets its own size, so
   * that adding a plate cannot resize a masthead on another page.
   *
   * `.gem-display` is the fifth, and it asked properly. The Astrology Zone's
   * gemstone sheets are the owner's own reference rendered in the city's
   * material: a stone photographed on white, three trait words arched over it,
   * and the name beneath in wide-tracked capitals. That name is the entire
   * composition — at .34em of tracking it is closer to a piece of engraving
   * than a heading, and the sans this application otherwise sets everything in
   * cannot do it. It is the same grant `.beauty-display` has for the same
   * reason: one editorial title, in one hub, from a reference the owner
   * supplied, whose character IS this face against the sans.
   *
   * The rule lives in layout.css rather than relief.css, which means
   * assertions 1 and 2 — both of which read `relief` only — cannot see it.
   * Assertion 4 reads BOTH files for exactly that reason. A guard that stops
   * at a file boundary is a guard with a door in it.
   */
  it('keeps the press inside the one page it was granted to', () => {
    const code = strip(relief);

    // 1. the two faces are declared, and only ever read through their tokens
    expect(strip(tokens)).toMatch(/--press-serif:\s*'Instrument Serif'/);
    expect(strip(tokens)).toMatch(/--press-mono:\s*'IBM Plex Mono'/);
    for (const m of stripFaces(code).matchAll(/font-family:\s*([^;]+);/g)) {
      expect(m[1]).not.toMatch(/'Instrument Serif'|'IBM Plex Mono'/);
    }
    // and the two files must actually ship, like every other face here
    expect(code).toMatch(/instrument-serif-400\.woff2/);
    expect(code).toMatch(/ibm-plex-mono-400\.woff2/);

    // 2. every press rule is scoped — by attribute, or by its own prefix
    const selectors = [...code.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
    // `aria-pressed` is not the press. Match the prefix and the attribute, not
    // the word — the first version of this caught every pressed pill in Relief.
    const pressRules = selectors.filter((sel) => /\.press-|\[data-press\]/.test(sel));
    expect(pressRules.length).toBeGreaterThan(20);
    const leaked = pressRules.filter((sel) =>
      !sel.includes('[data-press]') && !/(^|[\s,>])\.press-/.test(sel));
    expect(leaked).toEqual([]);

    // 3. and it is switched on only where it has been granted. Sorted, because
    // the walk returns directory order and a rename must not read as a breach.
    const wearers = PAGES.filter((f) => /data-press/.test(stripTs(read(f)))).sort();
    expect(wearers).toEqual([
      'src/features/nutrition/components/OwnDayView.tsx',
      'src/features/nutrition/pages/MealPlan.tsx',
      'src/features/nutrition/pages/RecipeDetail.tsx',
    ]);

    // 4. the FACE may be borrowed outside the press exactly once, by name.
    //    Read across both stylesheets: the borrower is in layout.css, and a
    //    guard that only reads relief.css would have nothing to say about it.
    const serifReaders: string[] = [];
    for (const sheet of [code, strip(layout)]) {
      for (const m of sheet.matchAll(/(^|\})([^{}@]+)\{([^}]*)\}/g)) {
        if (/var\(--press-serif\)/.test(m[3])) serifReaders.push(m[2].trim());
      }
    }
    const borrowed = serifReaders.filter((sel) => !/\.press-|\[data-press\]/.test(sel));
    //    `.dating-display` is the fifth name on the loan, and it is on the
    //    SAME selector group as the other four on purpose: one rule means one
    //    entry here, so the list stays a list of names rather than becoming a
    //    list of rules that happen to want the face. Dating's whole material
    //    is a gradient and a monochrome grade — no second colour, no second
    //    family — so the editorial title is the only thing it had left to set
    //    the page's own voice apart from the interface's. Lent by name, and
    //    the name is written here.
    expect(borrowed, 'the display serif is lent by name, and this is the list')
      .toEqual(['.letter-title,\n.letter-archive-day .t,\n.beauty-display,\n.gem-display,\n.dating-display']);
  });

  /**
   * EVERY PICTURE IS SET INTO THE PAGE.
   *
   * The rim has to be an `outline`, not an inset box-shadow: on a replaced
   * element an inset shadow paints BEHIND the bitmap, so a carved well around
   * a photograph is invisible and looks fine to whoever writes it, because
   * they will be testing against a transparent PNG.
   */
  it('cases every image, and cases it with an outline', () => {
    const code = strip(relief);
    // Matched on `img:not(.no-case)` once, which quietly encoded the bug: written
    // that way the rule outscores every exemption in its own list. It must be
    // :where(), which contributes no specificity.
    expect(code).toMatch(/img:not\(:where\([^)]*\.no-case/);
    expect(code).toMatch(/outline-offset:\s*-1px/);
    // and the double-rim exclusions exist, or a photo inside a case gets two
    expect(code).toMatch(/\.case > img[\s\S]{0,400}outline:\s*none/);
  });

  /**
   * THE STYLESHEET DOES NOT STYLE CLASSES THE MARKUP DOES NOT HAVE.
   *
   * `.n` is the sidebar's number badge and `.l` is its label. They were styled
   * as one rule once — because `.l` looked like it meant "the little icon" —
   * and the label inherited a 30x30 box, so every menu word wrapped inside a
   * square and printed on top of its own sub-line. Nothing failed: not the
   * typecheck, not the tests, not a single audit. A class name is a contract
   * between two files that never import each other, and this is the only thing
   * that can check it.
   */
  it('only styles shell classes the shell actually renders', () => {
    const SHELL = ['src/layouts/Sidebar.tsx', 'src/layouts/Header.tsx',
      'src/layouts/QuickActions.tsx', 'src/components/BottomNav.tsx'];
    const markup = SHELL.map(read).join('\n');
    // Class names arrive three ways in this shell: a literal className, a
    // ternary on isActive, and a template literal for the drawer's `open`. Any
    // quoted token in the file counts as rendered — loose on purpose, because
    // the defect worth catching is a class the component never mentions AT ALL.
    // TWO PASSES, because the drawer's open state is written
    // `className={`tc-side${open ? ' open' : ''}`}` — the class name lives in a
    // single-quoted string INSIDE a template expression. Strip the `${…}` and
    // it disappears; read the backticks naively and the whole expression parses
    // as one token. So: ordinary quotes first, backticks separately.
    const quoted = [...markup.matchAll(/['"]([^'"\n]{0,60})['"]/g)].map((m) => m[1]);
    const templated = [...markup.matchAll(/`([^`]{0,200})`/g)]
      .map((m) => m[1].replace(/\$\{[^}]*\}/g, ' '));
    const rendered = new Set([...quoted, ...templated]
      .flatMap((t) => t.split(/\s+/))
      .filter(Boolean));
    const offenders: string[] = [];
    for (const css of [relief, layout]) {
      // Only descendants of the shell containers — a global `.card` is not a
      // claim about what Sidebar.tsx renders.
      for (const m of strip(css).matchAll(/\.(side-menu|tc-nav|tc-actions|tc-actionbar|tc-side|tc-logo)\b[^{,]*?\.([a-z][a-z0-9-]*)/g)) {
        if (!rendered.has(m[2])) offenders.push(`.${m[1]} … .${m[2]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * THE SHELL DOES NOT SET ITS OWN MATERIAL FROM A STYLE PROP.
   *
   * `background: 'transparent'` in a style attribute beats every stylesheet in
   * the cascade, no matter how it is layered. The header's quick-action pills
   * carried exactly that, so they rendered with the RIM of --e1 and none of
   * its lit face — flat, on a page where everything else stood up, and
   * unfixable from CSS. Geometry may live in a style prop. Material may not.
   */
  it('leaves the shell material to the stylesheet', () => {
    const SHELL = ['src/layouts/Sidebar.tsx', 'src/layouts/Header.tsx',
      'src/layouts/QuickActions.tsx', 'src/components/BottomNav.tsx'];
    // NOT ALL INLINE STYLE IS THE PROBLEM. `boxShadow: 'var(--e3)'` in a style
    // prop cannot contradict the system — it IS the system, written somewhere
    // inconvenient. What breaks the material layer is a value the stylesheet
    // can never beat: `transparent`, a raw hex, or shouting. Those three, and
    // only those three, are what this refuses.
    const BAD = [
      [/\b(background|backgroundColor)\s*:\s*[^,}\n]*['"]transparent['"]/g, "background: 'transparent'"],
      [/\b(background|backgroundColor|boxShadow|color)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/g, 'a raw colour'],
      [/\btextTransform\s*:\s*['"]uppercase['"]/g, "textTransform: 'uppercase'"],
      [/\bletterSpacing\s*:/g, 'letterSpacing'],
    ] as const;
    const offenders: string[] = [];
    for (const file of SHELL) {
      const src = stripTs(read(file));
      for (const [re, what] of BAD) {
        if (new RegExp(re.source).test(src)) offenders.push(`${file}: ${what}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * EVERY HUB LANDING HAS A PICTURE THAT EXISTS.
   *
   * HUB_HERO is a Partial map with a `${hub}.webp` fallback, so a hub missing
   * from it does not fail — it points at a filename nobody ever created and
   * renders an empty frame. /mail did exactly that, and nothing anywhere said
   * so: not the typecheck, not a test, not an audit. The picture IS the hub
   * landing; half of that page is the photograph.
   */
  it('gives every hub landing a hero file that is actually on disk', () => {
    const page = read('src/pages/HubLanding.tsx');
    const routed = [...new Set([...read('src/app/router.tsx')
      .matchAll(/HubLanding hub="([a-z]+)"/g)].map((m) => m[1]))];
    expect(routed.length).toBeGreaterThan(10);
    // TWO MAPS LIVE IN THIS FILE NOW — the landscape hero every landing falls
    // back to, and the phone poster a hub may also have. Read as one blob they
    // merge, the later entry silently winning, so this guard would check the
    // wrong file for every hub that has both. Each map is read on its own, and
    // BOTH are checked: a hero for every routed hub, and a poster for every hub
    // that claims one.
    const mapNamed = (name: string): Record<string, string> => {
      const at = page.indexOf(`export const ${name}`);
      if (at < 0) return {};
      const body = page.slice(at, page.indexOf('};', at));
      return Object.fromEntries(
        [...body.matchAll(/^\s*([a-z]+):\s*'([^']+\.webp)'/gm)].map((m) => [m[1], m[2]]),
      );
    };
    const heroes = mapNamed('HUB_HERO');
    const posters = mapNamed('HUB_PORTRAIT');
    const onDisk = (file: string) => existsSync(join(APP, 'public/assets/img', file));
    const missing = [
      ...routed
        .map((h) => [h, heroes[h] ?? `${h}.webp`] as const)
        .filter(([, file]) => !onDisk(file))
        .map(([h, file]) => `hero ${h} → ${file}`),
      ...Object.entries(posters)
        .filter(([, file]) => !onDisk(file))
        .map(([h, file]) => `poster ${h} → ${file}`),
    ];
    expect(missing).toEqual([]);
  });

  /**
   * ── AND A TILE FOR EVERY HERO, SMALL ENOUGH TO BE ONE ───────────────────
   *
   * /hubs draws all thirteen doors at about 145px and was serving the landing
   * plates to do it: 2,075 KB of 1,915px artwork for a screen of thumbnails,
   * every one of them `loading="lazy"` and every one above the fold. Measured
   * on the live page, the document was ready in 97ms and the city took over
   * three seconds to arrive.
   *
   * The plates stay exactly as they are — they are the right size for the page
   * they were commissioned for. This asserts the OTHER file: a `-tile` beside
   * every hero, and a ceiling on it, because the failure this prevents is not
   * a missing file (that one is loud) but a 380 KB one quietly added later by
   * somebody copying the plate. 40 KB is roughly twice the largest tile today.
   */
  it('gives every hero a tile, and keeps the tile the size of a tile', () => {
    const page = read('src/pages/HubLanding.tsx');
    const at = page.indexOf('export const HUB_HERO');
    const body = page.slice(at, page.indexOf('};', at));
    const heroes = [...body.matchAll(/^\s*[a-z]+:\s*'([^']+\.webp)'/gm)].map((m) => m[1]);
    expect(heroes.length).toBeGreaterThan(10);

    const problems: string[] = [];
    for (const hero of heroes) {
      const tile = hero.replace(/\.webp$/, '-tile.webp');
      const path = join(APP, 'public/assets/img', tile);
      if (!existsSync(path)) { problems.push(`missing ${tile}`); continue; }
      const kb = Math.round(statSync(path).size / 1024);
      if (kb > 40) problems.push(`${tile} is ${kb} KB — a tile, not a plate`);
    }
    expect(problems).toEqual([]);
  });

  /**
   * THE CARD SHAPE IS MEASURED FROM THE CARDS.
   *
   * --tarot-card was 1 / 1.72 — the proportions of a real tarot card, and a
   * perfectly reasonable thing to type. The 78 artwork files are not that
   * shape: their ratios run from 0.607 to 1.809. Held in a 1:1.72 box the
   * typical card floated in a letterbox with a third of the frame empty.
   *
   * This reads the actual files. If the deck is re-cut, or a card is replaced
   * with a differently-shaped one, the token has to move with it — which is a
   * thing nobody would otherwise notice until it was on a screen.
   */
  it('shapes the tarot card from the artwork that ships', () => {
    const dir = join(APP, 'public/assets/img/tarot');
    const files = readdirSync(dir).filter((f) => f.endsWith('.webp'));
    expect(files.length).toBe(78);

    const ratios = files.map((f) => {
      const b = readFileSync(join(dir, f));
      const tag = b.subarray(12, 16).toString('latin1');
      let w = 0, h = 0;
      if (tag === 'VP8X') { w = b.readUIntLE(24, 3) + 1; h = b.readUIntLE(27, 3) + 1; }
      else if (tag === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
      else if (tag === 'VP8L') { const n = b.readUInt32LE(21); w = (n & 0x3fff) + 1; h = ((n >> 14) & 0x3fff) + 1; }
      return h / w;
    }).filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);

    const median = ratios[Math.floor(ratios.length / 2)];
    const declared = strip(tokens).match(/--tarot-card:\s*1\s*\/\s*([\d.]+)/);
    expect(declared, '--tarot-card is not declared as `1 / n`').toBeTruthy();
    // Within 10% of the median: close enough that most cards fill their frame,
    // loose enough that re-exporting the deck does not fail the build over a
    // rounding difference.
    expect(Math.abs(Number(declared![1]) - median) / median).toBeLessThan(0.1);
  });

  /**
   * AND NOTHING HARD-CODES IT BESIDE THE TOKEN, or a back and a face disagree
   * and the card changes shape as it turns.
   */
  it('shares one card shape between the backs and the faces', () => {
    const tarot = strip(layout).split('\n').filter((l) => /tarot/.test(l) && /aspect-ratio/.test(l));
    expect(tarot.length).toBeGreaterThanOrEqual(3);
    expect(tarot.filter((l) => !l.includes('var(--tarot-card)'))).toEqual([]);
  });

  /**
   * A WASH IS A BACKGROUND. IT IS NEVER TEXT.
   *
   * --accent-soft and the status washes are near-white by definition — they
   * exist to sit BEHIND something. On the dark surfaces this design used to
   * have, cream-on-black was correct, and the colour sweep did not catch these
   * because they are tokens, not hexes. When those surfaces turned white the
   * text turned invisible, and the page it happened to was the one whose
   * heading says "Birth Details".
   *
   * Nothing failed. The typecheck passed, every test passed, the contrast
   * audit passed — because none of them can see that a colour and its
   * background became the same colour.
   */
  it('never paints text with a background wash', () => {
    const WASH = /(?<![-\w])color:\s*'var\(--(accent-soft|ok-soft|warn-soft|danger-soft|info-soft|gold-soft|green-soft|blue-soft|rose-soft|purple-soft)\)'/;
    // CookMode is a full-screen near-black theatre — the one surface in the
    // application where a near-white wash IS the readable colour. It is named
    // rather than pattern-matched, so it has to be re-argued if it changes.
    const ON_A_DARK_STAGE = ['src/features/nutrition/components/CookMode.tsx'];
    const offenders: string[] = [];
    for (const file of PAGES) {
      if (ON_A_DARK_STAGE.includes(file)) continue;
      const m = stripTs(read(file)).match(new RegExp(WASH.source, 'g'));
      if (m) offenders.push(`${file} → ${[...new Set(m)].join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * AND NEAR-WHITE TEXT NEEDS SOMETHING DARK UNDER IT.
   *
   * Light type is correct on exactly one kind of surface in this design: a
   * photograph with a scrim over it. Anywhere else it is the same defect as
   * above wearing different syntax. A file that writes in near-white must also
   * paint something dark — a scrim, a media background, or a dark gradient.
   */
  it('only writes in near-white where something dark is painted', () => {
    const LIGHT = /color:\s*'rgba\(\s*2[0-5]\d\s*,\s*2[0-5]\d\s*,\s*2[0-5]\d/;
    // A dark paint is not always a dark LITERAL. Workout's theatre is
    // `linear-gradient(160deg, var(--ink), var(--ink))` — as black as it gets,
    // and invisible to a regex that only knows hexes and rgba.
    const DARK = /(--media-bg|var\(--ink\)|rgba\(\s*[0-2]?\d\s*,|#0[0-9a-f]|#1[0-9a-f])/i;
    const offenders: string[] = [];
    for (const file of PAGES) {
      const src = stripTs(read(file));
      if (!new RegExp(LIGHT.source).test(src)) continue;
      if (!new RegExp(DARK.source, 'i').test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * MOTION IS A PREFERENCE, AND A TRANSFORM IS NOT AN ANIMATION.
   *
   * The global reduced-motion rule only zeroes durations, so without this a
   * hover still jumps 3px instantly — worse, for somebody who asked for less
   * movement, than the movement they asked to be rid of.
   */
  it('stops hover movement for anybody who asked for less motion', () => {
    const reduced = strip(relief).slice(strip(relief).lastIndexOf('prefers-reduced-motion'));
    expect(reduced).toContain('transform: none');
  });

  /**
   * EVERY HUB HAS A LIGHT OF ITS OWN.
   *
   * data-hub only ever REPLACES a value, so a hub with no entry does not fall
   * back to something neutral — it inherits whichever hub the citizen came
   * from. A missing entry means Nutrition glows rose on the way in from
   * Dating, and nobody can reproduce it.
   */
  /**
   * ── AND NOW: NO HUB HAS A COLOUR OF ITS OWN ───────────────────────────────
   *
   * This asserted that every hub in the config had a `[data-hub]` block — that
   * no room inherited somebody else's light. Owner, 23 Aug: the same colour
   * rule in all the hubs. So the claim inverts, and the inversion is the
   * instruction stated as a test.
   *
   * TWO BLOCKS SURVIVE AND NEITHER IS A COLOUR. Dating keeps `--film`, the
   * greyscale grade on its portraits, which was never about the room; and
   * Entertainment keeps `--media-bg`, the black a video letterbox and a camera
   * viewfinder are shown in on any ground. Both are named here rather than
   * excluded by a pattern, so a third one has to be argued for.
   */
  it('gives no hub a colour of its own', () => {
    const hubs = read('src/config/hubs.ts');
    const map = hubs.slice(hubs.indexOf('export const HUBS'));
    const keys = [...new Set([...map.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThanOrEqual(14);

    const ALLOWED: Record<string, string[]> = { dating: ['film'], entertainment: ['media-bg'] };
    const offenders: string[] = [];
    for (const m of strip(tokens).matchAll(/\[data-hub="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g)) {
      const declared = [...new Set([...m[2].matchAll(/--([a-z0-9-]+):/g)].map((d) => d[1]))];
      const extra = declared.filter((d) => !(ALLOWED[m[1]] ?? []).includes(d));
      if (extra.length) offenders.push(`${m[1]}: ${extra.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ── AND AN ACCENT NO OTHER ROOM ALREADY HAS ─────────────────────────────
   *
   * The assertion directly above is named "gives every hub in the config an
   * accent of its own" and it has never compared two colours — it checks that
   * a `[data-hub]` block EXISTS. Measured across the twenty-six lamps it was
   * guarding: five unrelated rooms — legal, drive, thoughts, profile, settings
   * — all rendered #4a4a52, and travel sat 1.38 from medical, which is below a
   * just-noticeable difference, meaning no viewer could tell them apart. The
   * lamp is the one object that says which room you are standing in before a
   * word is read, and for six rooms it said nothing.
   *
   * ΔE2000, NOT A HEX COMPARISON, because the failure this exists to catch is
   * two colours a person cannot distinguish, and two different hex values do
   * that perfectly well. The maths is the CIE's; the floor is ours.
   *
   * THE FLOOR IS 5.0, RAISED FROM 3.5 ON 22 AUG. It had been held low by one
   * pair: restaurants and pets at 3.57, where which room moved was a question
   * about what a room is FOR and so the owner's call rather than a solver's.
   * The owner answered it by removing the restaurants hub, and the pair went
   * with it. The tightest surviving pair is mail against chat and connections
   * at 5.35, so the floor moves up behind it — which is the whole point of a
   * ratchet, and the first time this one has actually been turned. Raise it as
   * pairs are separated; never lower it.
   *
   * TWO PAIRS ARE ALLOWED TO BE IDENTICAL and both are one domain wearing two
   * doors: medical/medicines, and chat/connections. They are listed by name so
   * that a third such pair has to be argued for rather than merely added.
   */
  /**
   * ── AND ONE LAMP FOR THE WHOLE CITY ───────────────────────────────────────
   *
   * This compared every hub's lamp against every other's in ΔE2000 and failed
   * any pair closer than 5.0 — because two rooms whose lit key is nearly the
   * same colour are two rooms a citizen cannot tell apart by it.
   *
   * TWENTY-TWO HUBS DECLARED ONE AND NOW NONE DOES (23 Aug). That was
   * wayfinding while the rooms were different colours; in a city of one paper
   * it is twenty-two accents inside the one piece of furniture on every route.
   * The key still says which row you are on, by being the one dark object in
   * the rail.
   *
   * SO THE MEASUREMENT INVERTS, and the ΔE machinery goes with it: there is
   * nothing to compare. What is left is the claim that matters — the lamp is
   * declared once, at the root, and no hub re-points it.
   */
  it('lights every rail with the same lamp', () => {
    const css = read('src/styles/tokens.css');
    const root = strip(css).split(/\[data-hub=/)[0];
    expect(root).toMatch(/--lamp-face:\s*linear-gradient\([^;]*\);/);
    const rooms = [...strip(css).matchAll(/\[data-hub="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g)]
      .filter((m) => /--lamp-face:/.test(m[2])).map((m) => m[1]);
    expect(rooms).toEqual([]);
    // and it is one colour, not a gradient pretending to be flat
    const stops = root.match(/--lamp-face:\s*linear-gradient\(([^;]*)\);/)![1].match(/#[0-9a-f]{6}/gi)!;
    expect([...new Set(stops.map((c) => c.toLowerCase()))]).toHaveLength(1);
  });



  /**
   * A LUMINOUS ACCENT IS NOT A TEXT COLOUR.
   *
   * --accent is a FILL: white sits on it. --accent-ink is the same hue
   * darkened until it can be read on white. They are two names because one
   * colour cannot do both jobs and clear AA, and the moment --accent is used
   * as `color` on a white surface something a citizen needs to read stops
   * being readable.
   */
  it('never uses the fill accent as text on a white surface', () => {
    const offenders: string[] = [];
    for (const file of PAGES) {
      const src = stripTs(read(file));
      for (const m of src.matchAll(/(?:^|[^-\w])color:\s*'var\(--accent\)'/g)) {
        offenders.push(`${file} @ ${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE FONT SHIPS.
   *
   * font-display: swap means a missing file is invisible in development — the
   * system sans renders and everything looks nearly right. This is the only
   * place that failure becomes loud before a release.
   */
  /**
   * EVERY CUSTOM PROPERTY A SCREEN ASKS FOR IS ONE SOMEBODY DEFINED.
   *
   * `var(--surface-2)` survived the palette rewrite in two files. It does not
   * fail: an undefined custom property with no fallback resolves to nothing, so
   * the chip simply had no face and the transaction icon no disc, and both
   * looked deliberate. That is the whole danger — a dead token is invisible,
   * where a dead class at least leaves an unstyled element behind.
   *
   * A name counts as defined if ANYTHING declares it: tokens.css, any
   * stylesheet, or a component setting it inline. A `var(--x, fallback)` is
   * always fine, because the fallback is the definition.
   */
  it('never asks for a custom property nobody defines', () => {
    const CSS = [tokens, relief, layout, index, mira, social].map(strip);
    const TS = PAGES.map((f) => stripTs(read(f)));

    const defined = new Set<string>();
    for (const text of [...CSS, ...TS]) {
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      for (const m of text.matchAll(/'(--[\w-]+)'\s*:/g)) defined.add(m[1]);
    }

    const offenders: string[] = [];
    const files: Array<[string, string]> = [
      ['src/styles/tokens.css', CSS[0]], ['src/styles/relief.css', CSS[1]],
      ['src/styles/layout.css', CSS[2]], ['src/index.css', CSS[3]],
      ['src/styles/mira.css', CSS[4]], ['src/styles/social.css', CSS[5]],
      ...PAGES.map((f, i) => [f, TS[i]] as [string, string]),
    ];
    for (const [name, text] of files) {
      // Only a var() with NO fallback can resolve to nothing.
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (!defined.has(m[1])) offenders.push(`${name}: ${m[1]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * SOCIAL LIFE LABELS ITS OWN CONTROLS WITH ICONS, NOT EMOJI.
   *
   * This is not a taste rule — it is Icon.tsx's, written in that file since it
   * was created: "chrome — navigation, tabs, buttons and cards — uses these
   * consistent line icons instead of emoji. Emoji stay reserved for
   * user-generated content, chat reactions, mood/journal entries and AI-written
   * messages, where personality helps."
   *
   * Five Social Life screens broke it anyway, for months, in the places a
   * citizen looks first: the feed's filter tabs, every attach control on Create
   * Post, the category chips, the profile tabs. A rule nobody checks is a
   * comment, so this is the check.
   *
   * WHAT IS STILL ALLOWED, deliberately: the FEELINGS list and anything a
   * citizen typed. A mood is content. A tab is not.
   */
  it('labels Social Life chrome with icons rather than emoji', () => {
    const SCREENS = [
      'src/features/social/pages/SocialFeed.tsx',
      'src/features/social/pages/CreatePost.tsx',
      'src/features/social/pages/Profile.tsx',
      'src/features/social/pages/Saved.tsx',
      'src/features/thoughts/pages/Thoughts.tsx',
    ];
    /** A mood is something somebody chose to feel — content, not chrome. Both
     *  the list they pick from and the map that guesses one from their words
     *  are the same thing wearing different hats. */
    const CONTENT = [
      /const FEELINGS\s*=\s*\[[^\]]*\]/g,
      /const MOOD_HINTS[\s\S]*?\n\];/g,
    ];
    const EMOJI = /\p{Extended_Pictographic}|[\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

    const offenders: string[] = [];
    for (const file of SCREENS) {
      let src = stripTs(read(file));
      for (const skip of CONTENT) src = src.replace(skip, ' ');
      for (const m of src.matchAll(EMOJI)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file}:${line} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('references a font file the build can actually serve', () => {
    const urls = [...strip(relief).matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of new Set(urls)) {
      expect(u.startsWith('/assets/fonts/')).toBe(true);
    }
  });
});
