import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ── AN EMPTY ROOM HAS TWO CAUSES, AND THEY ARE NOT THE SAME SENTENCE ──
 *
 * Browse had one empty state — "no one to show just yet" — and rendered it
 * whatever emptied the room. The server has always sent the discriminator, and
 * says so above POOL_CEILING: "reported, never silent". `poolSize` counts who
 * the SQL found (right age, right seeking, visible, approved); anyone lost after
 * that was lost to a filter applied in JS, most of them the citizen's own. So a
 * poolSize of twelve with nothing discoverable is a setting, not a quiet city —
 * and telling somebody their city is empty is both false and the one thing they
 * cannot act on.
 *
 * The second half of the same defect: three deal-breaker chips rendered UNTICKED
 * while matching.ts had them filtering, because answering the matching field is
 * what turns them on. The rule stands; the form now agrees with it.
 *
 * They are drawn ON, and since 1 Sep they are also switches: unticking one
 * writes `-<label>`, which the engine reads as "score it, do not hide anybody
 * over it". Nobody has to delete an honest answer to stop it being a wall.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const api = read('./api.ts');
const browse = read('./pages/DatingBrowse.tsx');
const profile = read('./pages/DatingProfile.tsx');

describe('an empty room has two causes', () => {
  it('declares the two counts the server has always sent', () => {
    expect(api).toMatch(/poolSize: number;/);
    expect(api).toMatch(/poolCapped: boolean;/);
  });

  it('blames the settings when the settings are what emptied it', () => {
    expect(browse).toMatch(/poolSize \?\? 0\) > 0/);
    expect(browse).toMatch(/Your settings are hiding everyone/);
    expect(browse).toMatch(/Open my preferences/);
  });

  it('keeps the quiet-city sentence for an actually quiet city', () => {
    expect(browse).toMatch(/No one to show just yet/);
    expect(browse).toMatch(/New residents appear here the day they join/);
  });

  it('draws the three core filters as on by default', () => {
    expect(profile).toMatch(/const coreFilterOn: Record<string, string> = \{/);
    for (const k of ['Marriage Intentions', 'Wants Children', 'Diet']) {
      expect(profile).toContain(k);
    }
    expect(profile).toMatch(/on=\{core \? !coreOff\(v\) :/);
  });

  /**
   * AND EVERY ONE OF THEM CAN BE PRESSED TWICE. A default the citizen cannot
   * reverse is not a default, and the only escape the form used to offer was
   * deleting a true answer. The opt-out marker is what makes it a switch, so
   * both halves are pinned: no chip renders locked, and unticking a core chip
   * writes the marker rather than dropping the label.
   */
  it('leaves no chip locked, and turns a core chip off with a marker', () => {
    expect(profile).not.toMatch(/locked=/);
    expect(profile).toMatch(/const CORE_DEAL_BREAKERS: string\[\] = \['Marriage Intentions', 'Wants Children', 'Diet'\]/);
    expect(profile).toMatch(/const coreOff = \(v: string\) => \(dx\.dealBreakers \?\? \[\]\)\.includes\(`-\$\{v\}`\)/);
    expect(profile).toMatch(/`-\$\{v\}`\]/);
  });

  /**
   * A chip that is on by default must not be a silent one. If the explanation
   * ever goes, the form is back to filtering with no way to understand it — and
   * the sentence must also say the switch can be pressed.
   */
  it('says which answer turned each one on, and that it can be turned off', () => {
    expect(profile).toMatch(/so intent starts on/);
    expect(profile).toMatch(/so that starts on/);
    expect(profile).toMatch(/so diet starts on/);
    expect(profile).toMatch(/tap one to turn it off/);
    expect(profile).toMatch(/Your answer stays either way/);
  });
});
