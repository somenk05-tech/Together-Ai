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
    // --atmos-lip joins for the medical atmosphere: the lit top rim that makes
    // a smoked pane read as glass instead of a brown box. It is one inset
    // hairline of light — a way of being made, like --soft-in, not a height.
    const NAMED = /var\(--(e1|e2|e3|e1-key|e2-key|carve|carve-deep|press|shadow|shadow-deep|edge-up|edge-in|pip|pip-ok|case-rim|case-rim-soft|pane-rim|lens|lens-key|lamp|lamp-badge|key-lit|key-lit-pip|rail-well-shadow|glass|glass-key|glass-in|glass-tray-shadow|glass-bubble-shadow|prism|focus-ring|soft-in|soft-out|soft-tile|atmos-lip)\)/;
    // A photograph, a filled black button and a text emboss are not surfaces —
    // they are ink and images, and they carry their own light.
    const ALLOWED = /(text-shadow|drop-shadow|\.hero|\.btn-accent|\.btn-gold|\.btn-primary|\.ask-cta|\.step\.|\.mincal|\.tag\.dark|\.knob|outline|inset 0 1px 0|no-case|img:not|video:not|\.case)/;
    const offenders: string[] = [];
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index]] as const) {
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
    for (const [name, css] of [['relief.css', relief], ['layout.css', layout], ['index.css', index]] as const) {
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
  it('keeps the ground white at the root', () => {
    const root = strip(tokens).split(/\[data-hub=/)[0];
    for (const t of ['--ground', '--paper', '--card']) {
      expect(root).toMatch(new RegExp(`${t}:\\s*#ffffff`));
    }
    expect(strip(tokens)).not.toContain('[data-theme="dark"]');
  });

  /**
   * FIVE HUBS HAVE THEIR OWN GROUND, AND EACH IS SCOPED OR IT IS NOT AN
   * EXCEPTION.
   *
   * Three of the five are hubs you READ rather than operate; the other two
   * earn it on material instead, and say so. Either way a sixth is not
   * automatic:
   *
   *   nutrition — warm paper. It already held the only other surface exception
   *     ([data-press], granted because a day of food is read the way a menu is),
   *     and the press pages had become an ivory island inside a white hub.
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
   *   social — a lavender sweep, and the ONLY one whose argument is not "a hub
   *     you read". Social Life is one you post to as much as you read. Its
   *     case is about MATERIAL: relief.css has shipped .g-slab, .g-key and
   *     --glass-face for this hub since the ground-glass work, opaque, with a
   *     comment saying why — "clear glass on white has nothing behind it to
   *     bend" — and another saying what should happen if it earned its place.
   *     A tinted ground is the surface those classes were written for. The
   *     hub's content is also a wall of other people's photographs, which on
   *     white is a contact sheet.
   *   dating — candy, with one blue. The argument is social's, not nutrition's:
   *     MATERIAL. The hub is other people's photographs and nothing else — six
   *     of them a week, at the size of a face — and a photograph on white is a
   *     contact sheet in this hub for exactly the reason it is in that one.
   *     What makes it a separate line rather than "and also dating" is that it
   *     is the first ground with a FILM GRADE attached (--film, --grain): the
   *     room and the pictures in it are graded together, which is why the
   *     ground can be saturated without the photographs fighting it. Its
   *     accent hue is not the ground either — the ground is pink, the accent
   *     is the plate's blue straw, and the rose the hub used to carry is gone
   *     rather than demoted, because it would have been a third hue.
   *
   * THE ACCENT HUE IS NEVER THE GROUND. The tint that was removed washed the
   * page in the hub's GREEN. None of these does that: paper with the green
   * left in the fill, charcoal with the gold left in the fill, candy with the
   * blue left in the fill. A sixth hub asking for "a tint like nutrition's" is
   * asking for the removed thing, not for any of these, and gets its own line
   * here or nothing.
   *
   * The list is written out rather than counted, exactly like the press's
   * wearers, so a third entry costs an argument instead of a nod.
   */
  it('keeps a re-pointed ground inside the five hubs it was granted to', () => {
    const css = strip(tokens);
    const GRANTED = ['astrology', 'dating', 'entertainment', 'nutrition', 'social'];

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
      /data-hub=["'](nutrition|astrology)["']/.test(stripTs(read(f))));
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
    for (const hub of ['astrology', 'dating', 'entertainment', 'nutrition', 'social']) {
      // The block that owns the ground, found by the thing that makes it that
      // block rather than by position: nutrition and entertainment each once
      // had a plain accent one-liner elsewhere in the file, and matching the
      // first occurrence reads a palette out of the wrong one.
      const body = [...css.matchAll(new RegExp(`\\[data-hub="${hub}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'g'))]
        .map((m) => m[1]).find((b) => /--paper:/.test(b));
      expect({ hub, found: Boolean(body) }).toEqual({ hub, found: true });
      const val = (n: string) => body!.match(new RegExp(`${n}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
      const page = val('--paper')!, card = val('--card') ?? page;
      for (const [name, ground] of [
        ['--ink', page], ['--ink-soft', card], ['--muted', page], ['--faint', page],
        ['--accent-ink', page], ['--ok-ink', page], ['--warn-ink', page],
        ['--danger-ink', page], ['--info-ink', page],
      ] as const) {
        const ink = val(name);
        if (!ink) continue;                       // not re-pointed is not a failure
        const r = ratio(ink, ground);
        if (r < 4.5) failures.push(`${hub} ${name} at ${r.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
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
   * A NIGHT GROUND IS NOT A DARK MODE — AND A ROOM WITH NO HUE STILL OWES ITS
   * FURNITURE AN INK.
   *
   * The difference between a night ground and a dark mode is not the colour,
   * it is who chooses. A dark mode is a second copy of every screen behind a
   * switch, and half-converted it reads as a bug — which is why it was
   * removed. A room with its own light is a property of the room: nothing
   * toggles, and a citizen who never opens Astrology never sees a dark pixel.
   *
   * 1. THE ROOM CARRIES ITS OWN INK, AND ITS WELL FOLLOWS ITS GROUND. Ink,
   *    ground and the readable accent are re-pointed together or the "Birth
   *    Details" failure comes back: a colour and its background becoming the
   *    same colour, which nothing else here can see. And the rail's labels
   *    read --ink / --faint, so a white well under near-white text is the hub
   *    name gone — a hub that re-points --paper MUST re-point --rail-well.
   *
   * 2. --on-accent IS STILL THE CITY'S. It is read by SEVEN dark surfaces:
   *    the black primary button, .tag.dark, the mini-calendar's today, the
   *    media bar, the lit glass key, and the rail lamp's label and badge.
   *    Re-pointing it for one hub turns the black button's own label black —
   *    not a contrast regression, an invisible button, and no test outside
   *    this one would see it.
   *
   * 3. BUT THE LAMP MAY LEAVE, AND IF IT LEAVES ITS INK GOES WITH IT.
   *    This clause replaces a flat ban, and the swap is the interesting part.
   *    The ban said the rail keeps its orange in all twenty-five rooms
   *    because the rail is the city's furniture. That held while every room
   *    had a hue of its own for the eye to land on. Monochrome breaks it: an
   *    orange lamp in a room with no other colour is the most saturated
   *    object on the screen, so the eye goes to the navigation instead of to
   *    the content. Entertainment already made this argument for its green
   *    and the spec accepted it; writing it down for a second hub turns a
   *    precedent into a rule.
   *
   *    What replaces the ban is the invariant the ban was really protecting:
   *    A LAMP'S FACE AND A LAMP'S INK MOVE TOGETHER. The failure mode was
   *    never "the lamp changed colour", it was "the lamp changed and its
   *    label did not" — which is how you get white type on a white pill and
   *    a rail whose current room is unreadable. Same shape as the
   *    ground/well pairing above, and it is a STRONGER guard than the ban
   *    was, because the ban could be satisfied by a hub that never touched
   *    the lamp and still broke it through --on-lamp.
   *
   * 4. NO SURFACE HARDCODES ITS OWN LIGHT GROUND, AND NO THEME SWITCH
   *    RETURNS. `.btn-secondary` was `background: #fff` under a label that
   *    follows the room — achromatic, so the colour guard allowed it, and
   *    invisible-by-luck on white; on a night ground it is a control you can
   *    neither read nor see.
   */
  it('gives the night hub its own ink, and moves the lamp and its label as one', () => {
    const css = strip(tokens);
    const night = /\[data-hub="astrology"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(night).not.toEqual('');

    // 1. ink, ground and the readable accent are re-pointed together...
    for (const t of ['--ground', '--paper', '--card', '--ink', '--muted', '--accent-ink']) {
      expect({ token: t, present: new RegExp(`${t}\\s*:`).test(night) })
        .toEqual({ token: t, present: true });
    }
    //    ...and the well follows the ground.
    expect({ ground: /--paper\s*:/.test(night), well: /--rail-well\s*:/.test(night) })
      .toEqual({ ground: true, well: true });

    // 2. the city's seven dark surfaces keep their white.
    expect({ token: '--on-accent', rePointed: /--on-accent\s*:/.test(night) })
      .toEqual({ token: '--on-accent', rePointed: false });

    // 3. the lamp may go — with its ink. Either both move or neither does.
    const lampFace = /--lamp-face\s*:/.test(night);
    const lampInk = /--on-lamp\s*:/.test(night);
    expect({ lampFace, lampInk }).toEqual({ lampFace, lampInk: lampFace });
    // and nothing scopes a rail rule to this hub by the back door — whatever
    // the lamp is made of, it is made of it in the TOKEN layer where this
    // test can read it, not in a selector that patches it afterwards.
    expect(css).not.toMatch(/\[data-hub="astrology"\][^{]*\.side-menu/);

    // 4. no hardcoded light ground in the material, no theme switch anywhere.
    const litBg = [...strip(relief).matchAll(/background(?:-color)?:\s*(#f[0-9a-fA-F]{2,5}\b|#ffffff\b|white\b)/g)]
      .map((m) => m[1]);
    expect(litBg).toEqual([]);
    expect(css).not.toContain('[data-theme');
  });

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
    const map = Object.fromEntries(
      [...page.matchAll(/^\s*([a-z]+):\s*'([^']+\.webp)'/gm)].map((m) => [m[1], m[2]]),
    );
    const missing = routed
      .map((h) => [h, map[h] ?? `${h}.webp`] as const)
      .filter(([, file]) => !existsSync(join(APP, 'public/assets/img', file)))
      .map(([h, file]) => `${h} → ${file}`);
    expect(missing).toEqual([]);
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
  it('gives every hub in the config an accent of its own', () => {
    const hubs = read('src/config/hubs.ts');
    const keys = [...new Set([...hubs.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThanOrEqual(14);
    expect(keys.filter((k) => !tokens.includes(`[data-hub="${k}"]`))).toEqual([]);
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
    const CSS = [tokens, relief, layout, index].map(strip);
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
