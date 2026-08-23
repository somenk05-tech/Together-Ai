import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const API = join(APP, '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const api = (p: string) => readFileSync(join(API, p), 'utf8');
/**
 * The page with its comments stripped — a comment is not copy on a screen —
 * and its whitespace collapsed, because JSX breaks a sentence across lines
 * wherever the indentation falls and a phrase this file looks for is a phrase
 * the reader sees as one line.
 */
const copy = () => read('features/astrology/pages/AstroAsk.tsx')
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/&mdash;/g, '—')
  .replace(/&rsquo;/g, '’')
  .replace(/\s+/g, ' ');

/**
 * ── THE MASTHEAD CLAIMS WHAT THE ENGINE DOES ────────────────────────────────
 *
 * Owner, 23 Aug: replace the consultation room's masthead with the case for
 * asking here — that three astrologers given one chart hand back three
 * readings, and that this room answers with one.
 *
 * THE COPY MAKES CLAIMS ABOUT OUR OWN SOFTWARE, which is a different kind of
 * sentence from "a private consultation" and needs a different kind of care.
 * The brief's own wording offered "billions of interconnected astrological data
 * points". Nothing counts anything of the sort: `ask()` composes a brief from a
 * natal chart, the transiting positions at the moment of asking, the aspects
 * between those two on the question's ruling planets, the month's best and
 * slowest days, and the last five questions with the last three answers. That
 * is a genuinely personal reading and it is not billions of anything, so the
 * masthead says the true thing instead.
 *
 * These assertions hold the copy to the code. Each phrase on the screen is
 * matched to the line that earns it, so the day either moves the other has to
 * move with it — the same instrument as the gem counter's price formula.
 */
describe('the masthead claims what the engine does', () => {
  it('names the transits, and the engine reads them at the moment of asking', () => {
    expect(copy()).toMatch(/transits/i);
    expect(api('astrology/astro-content.ts')).toMatch(/const transits = positionsAt\(julianDay\(now\)\)/);
  });

  it('names the aspects on your subject, and the engine works them per topic', () => {
    expect(copy()).toMatch(/aspects on your subject/i);
    const brief = api('astrology/astro-content.ts');
    expect(brief).toMatch(/TOPIC_PLANETS\[key\]/);
    expect(brief).toMatch(/aspectBetween\(t\.lon, natal\.lon\)/);
  });

  it('names the month’s timing, and the engine scans the month', () => {
    expect(copy()).toMatch(/month’s timing|month's timing/i);
    expect(api('astrology/astrology.service.ts')).toMatch(/scanMonth\(chart/);
    expect(api('astrology/astro-content.ts')).toMatch(/monthAstro\.bestDates/);
  });

  it('names your earlier questions, and the engine actually reads them', () => {
    expect(copy()).toMatch(/every question you have asked before/i);
    const svc = api('astrology/astrology.service.ts');
    expect(svc).toMatch(/astroQuestion[\s\S]{0,120}orderBy: \{ createdAt: 'desc' \}/);
    expect(svc).toMatch(/const history = priorRows\.map/);
  });

  it('says powered by AI, and the answer is written by one', () => {
    expect(copy()).toMatch(/powered by AI/i);
    expect(api('astrology/astrology.service.ts')).toMatch(/const answer = await this\.writeAnswer\(/);
  });

  /**
   * AND NO NUMBER NOBODY COUNTED. This is the assertion the whole file is for.
   * A scale claim is the easiest thing in the world to put on a masthead and
   * the hardest to take back once somebody has read it, and there is no
   * counter anywhere in this codebase that could substantiate one.
   */
  it('puts no uncounted scale claim on the page', () => {
    const c = copy();
    expect(c).not.toMatch(/billions?|millions?|trillions?/i);
    expect(c).not.toMatch(/data points/i);
  });
});

describe('the night band', () => {
  it('is a band this page contains, not a retheme of the hub', () => {
    const css = readFileSync(join(SRC, 'styles/layout.css'), 'utf8');
    const block = css.slice(css.indexOf('.astra {'), css.indexOf('.ask-card {'));
    expect(block).toMatch(/background: var\(--media-bg\)/);
    /* The hub is cream paper and relief.css argues that at length. A dark
       masthead is allowed to be dark; it is not allowed to re-point --ground,
       --paper or --card, which is what would take the rest of the page with
       it. */
    for (const token of ['--ground:', '--paper:', '--card:']) {
      expect({ token, repointed: block.includes(token) }).toEqual({ token, repointed: false });
    }
    // Colours from tokens only — the reference poster's orange is not in this
    // system and inventing one would fail colour-literal-ceiling anyway.
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('ships the photograph it draws, at the weight of a masthead', () => {
    const file = join(APP, 'public/assets/img/astra-sky.webp');
    expect(existsSync(file)).toBe(true);
    expect(Math.round(statSync(file).size / 1024)).toBeLessThanOrEqual(110);
    // Decorative: the heading beside it is what a screen reader should read.
    expect(copy()).toMatch(/className="astra-sky"[^>]*alt=""/);
  });
});
