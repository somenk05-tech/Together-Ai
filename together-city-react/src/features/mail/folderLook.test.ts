import { describe, it, expect } from 'vitest';
import { iconForName, tintOf, FOLD_TINTS } from './folderLook';

/**
 * The mark on a folder is GUESSED from its name, which is a decision with a
 * known failure mode, so the failure mode is pinned here rather than left to
 * be discovered on somebody's mailbox.
 */
describe('the mark a folder wears', () => {
  it('draws the reference set, from the names the reference used', () => {
    expect(iconForName('Film Project')).toBe('movie');
    expect(iconForName('Client X')).toBe('user');
    expect(iconForName('Investors')).toBe('chart');
    expect(iconForName('Marketing')).toBe('megaphone');
    expect(iconForName('Legal')).toBe('doc');
    expect(iconForName('HR & Hiring')).toBe('people');
    expect(iconForName('Travel & Events')).toBe('flight');
    expect(iconForName('Personal')).toBe('personal');
  });

  it('gives a plain folder to a name that is a NAME, which is the honest answer', () => {
    // The one the owner was warned about. A folder is a folder; a confident
    // wrong pictogram is the failure that matters.
    expect(iconForName('ABG')).toBe('sort');
    expect(iconForName('Kwan & Sons')).toBe('sort');
    expect(iconForName('')).toBe('sort');
    expect(iconForName('   ')).toBe('sort');
  });

  it('matches whole words, so a needle inside a longer word does not fire', () => {
    // 'art' is not a needle, but this is the class of bug whole-word matching
    // exists to prevent: a substring match on 'me' would hit almost everything.
    expect(iconForName('Bharti')).toBe('sort');
    expect(iconForName('Homeopathy')).toBe('sort');
    // and the real word still matches inside a longer NAME
    expect(iconForName('Q3 Marketing Push')).toBe('megaphone');
  });

  it('reads a possessive and a plural as the same word', () => {
    expect(iconForName("Client's Files")).toBe('user');
    expect(iconForName('Contracts')).toBe('doc');
  });

  it('takes the first rule in priority order when a name hits two', () => {
    // Client wins over work, because 'Client X' is a person you deal with —
    // the reference drew a person on it, not a briefcase.
    expect(iconForName('Client Project')).toBe('user');
    // Legal wins over business.
    expect(iconForName('Business Contracts')).toBe('doc');
  });

  it('is case- and punctuation-blind', () => {
    expect(iconForName('LEGAL')).toBe('doc');
    expect(iconForName('travel/events')).toBe('flight');
    expect(iconForName('HR — Hiring 2026')).toBe('people');
  });
});

describe('the tint a folder wears', () => {
  it('keeps every colour a citizen can pick', () => {
    for (const t of FOLD_TINTS) expect(tintOf(t)).toBe(t);
    expect(FOLD_TINTS).toHaveLength(9);
  });

  it('falls back to slate rather than to nothing', () => {
    // A tint written by a newer client must render a grey folder, never a
    // colourless one with no tab at all.
    expect(tintOf('chartreuse')).toBe('slate');
    expect(tintOf(null)).toBe('slate');
    expect(tintOf(undefined)).toBe('slate');
    expect(tintOf('')).toBe('slate');
  });
});
