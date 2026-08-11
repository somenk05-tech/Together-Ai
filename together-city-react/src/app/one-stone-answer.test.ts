import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ONE SURFACE PRESCRIBES A STONE, AND IT IS THE MARKETPLACE.
 *
 * The Astrology Zone had a Gems & Remedies page recommending a stone from the
 * running period, with no entry in the sidebar — a live prescription nobody
 * could reach. Adding a Gemstones tab beside it would have made two engines
 * answering "which stone is mine" from two different readings: one from the
 * dasha lord alone, one from the ascendant, ninth house, period, moon rashi and
 * life path. Both confident, both reachable, and disagreeing in public.
 *
 * The wearing table was the same failure one layer down — nine rows in the
 * codebase twice, agreeing on eight planets and disagreeing about which finger
 * Ketu's stone goes on. The server side of that is asserted in
 * gem-recommend.spec.ts; this is the surface side.
 */
describe('the gemstone marketplace', () => {
  const gems = code('features/astrology/pages/AstroGemstones.tsx');
  const remedies = code('features/astrology/pages/AstroRemedies.tsx');
  const hubs = code('config/hubs.ts');
  const router = code('app/router.tsx');

  it('is reachable — a prescription nobody can open is the bug this replaced', () => {
    expect(hubs).toMatch(/\/astrology\/gemstones/);
    expect(router).toMatch(/\/astrology\/gemstones/);
    expect(code('features/astrology/shared.tsx')).toMatch(/\/astrology\/gemstones/);
  });

  it('leaves the remedies page with no stones on it at all', () => {
    // Not a shorter list of stones — none. The page keeps the practices and
    // points across, which is why it also stopped calling itself "Gems &".
    expect(remedies).not.toMatch(/useAstroGems\b/);
    expect(remedies).not.toMatch(/GemCard/);
    expect(remedies).toMatch(/\/astrology\/gemstones/);
    expect(remedies).not.toMatch(/Gems &amp; Remedies|Gems & Remedies/);
  });

  it('says which finger, which hand, which metal and which day', () => {
    // The first question anybody asks about a prescribed stone, and the answer
    // used to live only on the page with no way in.
    for (const label of ['Finger', 'Hand', 'Metal', 'First worn']) {
      expect({ label, shown: gems.includes(`label="${label}"`) }).toEqual({ label, shown: true });
    }
    expect(gems).toMatch(/wearing\.finger/);
  });

  it('opens on the chart, not on the shelf', () => {
    // Chart strip → recommendations. Thirty stones exist and this page never
    // lists them; the moment it maps a full catalogue it has become a jewellery
    // site with an astrology theme.
    expect(gems).toMatch(/data\.recommendations\.map/);
    expect(gems).not.toMatch(/\b(GEMS|catalog|catalogue)\.map/);
    expect(gems).toMatch(/isn’t yours|isn't yours/);
  });

  it('shows the cheaper stone for the same planet', () => {
    // A diamond is ₹150,000 a carat and a white sapphire is ₹6,000. Answering
    // "which stone" honestly and "what it costs" not at all is half an answer.
    expect(gems).toMatch(/rec\.substitutes/);
    expect(gems).toMatch(/perCaratMinInr/);
  });

  it('prints the 72-hour trial note where the server flags it', () => {
    expect(gems).toMatch(/rec\.trialNote/);
  });

  it('says what is missing without a birth time instead of guessing it', () => {
    expect(gems).toMatch(/timeUnknown/);
    expect(gems).toMatch(/haven’t guessed|haven't guessed/);
  });

  it('says how many carats, and never invents the figure', () => {
    // A price per carat is not a price. The weight comes from the tradition's
    // own rule applied to this person's body weight — and when there is no body
    // weight on file there is no figure, which is the same refusal the
    // ascendant gets without a birth time, for a larger sum of money.
    expect(gems).toMatch(/rec\.weight/);
    expect(gems).toMatch(/CARATS/);
    expect(gems).toMatch(/one ratti for every ten kilos/);
    expect(gems).toMatch(/won’t guess at it|won't guess at it/);
    // No literal carat figure anywhere in the page.
    expect(gems).not.toMatch(/carats:\s*\d/);
  });

  it('is the owner\'s sheet, not a product row', () => {
    /**
     * THE COMPOSITION IS THE REFERENCE'S. A capsule, three trait words arched
     * over the stone, the name in engraved capitals, centred prose, a price
     * ring. The first build of this page was a photograph on the left and a
     * grey grid of facts on the right — a perfectly good product row that threw
     * the whole reference away.
     */
    expect(gems).toMatch(/gem-sheet/);
    expect(gems).toMatch(/textPath/);
    expect(gems).toMatch(/gem-display/);
    expect(gems).toMatch(/gem-price/);
    // Every added section speaks the reference's own vocabulary rather than
    // inventing a second one.
    expect(gems).toMatch(/<Sub>/);
    expect(gems).not.toMatch(/gridTemplateColumns/);
  });

  it('names no colour of its own — the palette is the catalogue\'s', () => {
    /**
     * Each sheet is themed to its stone: a ruby's title in oxblood, an
     * emerald's in deep green. relief.spec forbids colour written into a page
     * and is right to — a hex typed here is a decision made outside the system.
     * These arrive in the payload beside the photograph and the price. This is
     * the assertion that keeps it that way.
     */
    expect(gems).toMatch(/gem\.theme\.title/);
    expect(gems).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(gems).not.toMatch(/rgba?\(/);
  });
});
