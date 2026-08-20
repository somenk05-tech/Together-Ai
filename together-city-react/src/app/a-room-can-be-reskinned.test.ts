import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

const tokens = read('styles/tokens.css');
const relief = read('styles/relief.css');
const registry = read('config/skins.ts');
const hook = read('hooks/useHubTheme.ts');
const chats = read('features/chat/pages/Chats.tsx');

/** every .ts/.tsx under src, so "written in exactly one place" is checkable. */
const SOURCES: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(join(APP, dir))) {
    const rel = join(dir, e);
    if (statSync(join(APP, rel)).isDirectory()) walk(rel);
    else if (/\.tsx?$/.test(e)) SOURCES.push(rel);
  }
})('.');

const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** the `html[data-skin="x"] { ... }` blocks, keyed. */
const skinBlocks = new Map<string, string>();
for (const m of strip(tokens).matchAll(/html\[data-skin="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
  skinBlocks.set(m[1], m[2]);
}
const declared = (body: string) => new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const valueOf = (body: string, name: string) =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? null;

describe('a room can be reskinned', () => {
  /**
   * THE FEATURE, IN ONE SENTENCE: white and black is the city, and Mail and
   * Chat may be repainted by the citizen who sits in them.
   *
   * WHY THIS FILE IS LONG. relief.spec has banned `[data-theme` since dark mode
   * was removed, and the ban stays — what it was written against was a theme
   * store nothing imported that still set an attribute the moment a lazy chunk
   * loaded. A second palette is not that failure; a second palette wired the
   * same careless way IS. So every property that makes this the opposite shape
   * is asserted here rather than promised in a comment.
   *
   * That distinction matters today in particular: earlier this week a comment
   * in beauty.controller.ts claimed "if they drift, budget-is-a-limit.spec.ts
   * fails". No test read that file, the bound drifted, and a button shipped
   * broken for three days. A guard that is described and not written is worse
   * than none, because it is a reason not to look.
   */
  it('declares the same skins in the registry and the token file', () => {
    const keys = [...registry.matchAll(/\{ key: '([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(keys.length).toBeGreaterThan(0);
    expect([...skinBlocks.keys()].sort()).toEqual(keys);
  });

  /**
   * A PARTIAL RE-POINT IS THE BUG THIS WHOLE SET EXISTS TO PREVENT.
   *
   * Dating shipped on 20 Aug with re-pointed grounds and inks and the ORIGINAL
   * faces — `--face`, `--face-2`, `--face-tall`, `--face-key`, `--well` are
   * literal white gradients at :root, and they drive tags, chips, doors, hub
   * pills and the phone's tab strip. Every lozenge in the room stayed white
   * with the room's near-white type on it, and the owner had to report it.
   *
   * So a skin owes the full set, and a DARK skin owes the faces on top. A light
   * skin does not: its panels are still white, so the root faces are correct
   * there and re-declaring them would be a copy that can drift.
   */
  it('gives every skin a complete scale, and every dark skin its faces', () => {
    const CORE = [
      'sky-image', 'ground', 'paper', 'card', 'wash', 'rail-well',
      'ink', 'ink-soft', 'muted', 'faint', 'line',
      'on-paper', 'on-paper-soft', 'on-paper-muted', 'on-paper-faint',
      'accent', 'accent-ink', 'on-accent', 'accent-soft', 'accent-line',
      'lamp-face', 'on-lamp', 'frost',
    ];
    const FACES = ['face', 'face-2', 'face-tall', 'face-key', 'well', 'lens-face'];

    const missing: string[] = [];
    for (const [key, body] of skinBlocks) {
      const has = declared(body);
      for (const t of CORE) if (!has.has(t)) missing.push(`${key} is missing --${t}`);
      const isDark = new RegExp(`key: '${key}'[^}]*dark: true`).test(registry);
      if (isDark) for (const t of FACES) if (!has.has(t)) missing.push(`${key} is dark and is missing --${t}`);
    }
    expect(missing).toEqual([]);
  });

  /** A scope may change what a token is MADE OF, never how many there are. */
  it('lets no skin invent a token name', () => {
    const rootNames = declared(strip(tokens).split(/\[data-hub=|html\[data-skin=/)[0]);
    for (const [key, body] of skinBlocks) {
      expect({ key, invented: [...declared(body)].filter((n) => !rootNames.has(n)) })
        .toEqual({ key, invented: [] });
    }
  });

  /**
   * AND EVERY INK IS READABLE ON THE SKY IT IS DECLARED BESIDE — COMPUTED.
   *
   * Not "it looked fine": the stops are read out of this file and every ink is
   * measured against every one of them. Six of the eight palettes the owner
   * sent FAILED this on the first attempt, because a swatch is a colour and a
   * room needs a ground that commits to being light or dark. Mocha fudge
   * #7B5F5F is the clean example — white on it is 3.53:1 and black 5.94:1, so
   * a wall painted in it has no readable ink at all. That is a fact about the
   * colour, and the only way to know it is to measure.
   *
   * `--faint` is held to AA like the rest rather than to a 3:1 metadata floor.
   * These rooms are read for hours; the scale collapses to three inks where a
   * fourth would fail, which is why three skins set --faint to --muted's value.
   */
  it('clears AA for every ink on every stop of its own sky', () => {
    const failures: string[] = [];
    for (const [key, body] of skinBlocks) {
      const sky = valueOf(body, 'sky-image') ?? '';
      const stops = [...sky.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
      expect({ key, stops: stops.length > 1 }).toEqual({ key, stops: true });

      for (const t of ['ink', 'ink-soft', 'muted', 'faint', 'accent']) {
        const hex = valueOf(body, t);
        if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) { failures.push(`${key} --${t} is not a hex: ${hex}`); continue; }
        for (const stop of stops) {
          const r = ratio(hex, stop);
          if (r < 4.5) failures.push(`${key} --${t} is ${r.toFixed(2)}:1 on ${stop}`);
        }
      }
      // and the ink a solid accent reverses out in
      const acc = valueOf(body, 'accent');
      const on = valueOf(body, 'on-accent');
      if (acc && on && /^#/.test(acc) && /^#/.test(on) && ratio(on, acc) < 4.5) {
        failures.push(`${key} --on-accent is ${ratio(on, acc).toFixed(2)}:1 on its own accent`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * ONE WRITER, AND IT IS THE HOOK THAT ALREADY OWNS THIS ELEMENT.
   *
   * This is the exact property the removed dark mode did not have. If a second
   * file ever sets `data-skin`, the attribute becomes something that arrives
   * from a module nobody can name — and that, not the existence of a palette,
   * is what relief.spec's `[data-theme` ban was written about.
   */
  it('writes data-skin in exactly one file, and removes it on the way out', () => {
    const writers = SOURCES.filter((f) => /setAttribute\(\s*['"]data-skin['"]/.test(read(f)));
    expect(writers).toEqual(['hooks/useHubTheme.ts']);
    expect(hook).toMatch(/removeAttribute\(\s*'data-skin'\s*\)/);
  });

  /**
   * AND IT REACHES TWO ROOMS. A skin on Medical or Financial would take away
   * the thing a hub palette is FOR — telling you which room you are standing
   * in. The allow-list is the feature's whole blast radius, so it is checked
   * rather than trusted.
   */
  it('offers a skin only to Mail and Chat', () => {
    expect(registry).toMatch(/export const SKINNABLE = \['mail', 'chat'\] as const;/);
    expect(hook).toMatch(/isSkinnable\(hub\)/);
  });

  /**
   * THE TWO ROOMS ARE PAINTED BY TWO MECHANISMS, ON PURPOSE, AND THE KEYS TIE
   * THEM TOGETHER.
   *
   * Chat already had this feature — eight stages, a swatch row, a stored
   * preference and a guard — built when the owner first sent palette cards.
   * Mail had nothing, so Mail got `data-skin`. Rebuilding Mail's mechanism
   * inside Chat would have been two colour systems in one room, disagreeing the
   * first time either was touched.
   *
   * What makes that safe rather than sloppy is that the KEYS match: picking
   * "Rolex" in Mail and "Rolex" in Chat has to mean one green. If a palette is
   * ever added to one side only, this fails and says which side.
   */
  it('offers the same palettes in the inbox and the chat room', () => {
    const skins = [...registry.matchAll(/\{ key: '([a-z]+)'/g)].map((m) => m[1]);
    const stages = [...chats.matchAll(/\{ id: '([a-z]+)', name:/g)].map((m) => m[1]);
    // Chat keeps `slate` and the eight it already had; what it must not do is
    // MISS one of the skins.
    expect(skins.filter((k) => !stages.includes(k))).toEqual([]);
    for (const key of skins) {
      expect({ key, hasStage: new RegExp(`\\.cstage\\[data-stage="${key}"\\]`).test(tokens) })
        .toEqual({ key, hasStage: true });
    }
  });

  /**
   * AND THE MATERIAL HALF IS WRITTEN ONCE.
   *
   * Every granted hub carries a near-identical copy of this block — paint the
   * sky, make the shell transparent, frost the surfaces — and the drift between
   * those copies is where two of this week's bugs came from. Nine more copies
   * would have been nine more places to forget `.modal`.
   */
  it('paints a skinned room from one block, not nine', () => {
    const skinRules = [...strip(relief).matchAll(/\[data-skin\][^{]*\{/g)].length;
    expect(skinRules).toBeGreaterThan(0);
    // no rule pins the machinery to a single skin — that is how one block
    // quietly becomes nine.
    expect(strip(relief)).not.toMatch(/\[data-skin="[a-z]+"\]/);
  });
});
