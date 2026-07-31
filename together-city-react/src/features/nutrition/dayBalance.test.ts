import { describe, expect, it } from 'vitest';
import { OVER, UNDER, balanceNote, dayBalance } from './dayBalance';

const T = { protein: 100, carb: 200, fat: 60 };
const day = (protein: number, carbs: number, fat: number) => ({ protein, carbs, fat });

describe('dayBalance — a sentence naming three things has to be true of all three', () => {
  it('is balanced when every macro is inside its band', () => {
    expect(dayBalance(day(100, 200, 60), T)).toEqual({ kind: 'balanced' });
  });

  it('THE BUG: a day badly short on protein is no longer called balanced', () => {
    // Under the old rule this day scored well overall — carbs and fat are
    // perfect — and the page said "Great balance of protein, carbs & healthy
    // fats!" over half the protein it should have had.
    const v = dayBalance(day(45, 200, 60), T);
    expect(v).toEqual({ kind: 'off', short: ['protein'], over: [] });
    expect(balanceNote(v)).toContain('light on protein');
  });

  it('names every macro that is off, in order', () => {
    expect(dayBalance(day(40, 60, 20), T)).toEqual({ kind: 'off', short: ['protein', 'carbs', 'fat'], over: [] });
  });

  it('separates short from heavy', () => {
    const v = dayBalance(day(50, 300, 60), T);
    expect(v).toEqual({ kind: 'off', short: ['protein'], over: ['carbs'] });
    expect(balanceNote(v)).toBe('Today is light on protein and heavy on carbs — the rest lands where it should.');
  });

  it('does not scold anyone for eating extra protein', () => {
    // Protein has a floor and no ceiling on purpose. 3× the target is not a
    // balance problem worth a sentence on a meal plan.
    expect(dayBalance(day(300, 200, 60), T)).toEqual({ kind: 'balanced' });
  });

  it('DOES flag carbs and fat eaten well past target', () => {
    expect(dayBalance(day(100, 300, 60), T)).toEqual({ kind: 'off', short: [], over: ['carbs'] });
    expect(dayBalance(day(100, 200, 120), T)).toEqual({ kind: 'off', short: [], over: ['fat'] });
  });

  it('treats the band edges as inside', () => {
    expect(dayBalance(day(100 * UNDER, 200 * UNDER, 60 * UNDER), T)).toEqual({ kind: 'balanced' });
    expect(dayBalance(day(100, 200 * OVER, 60 * OVER), T)).toEqual({ kind: 'balanced' });
  });

  it('is off a hair outside them', () => {
    expect(dayBalance(day(79, 200, 60), T).kind).toBe('off');
    expect(dayBalance(day(100, 241, 60), T).kind).toBe('off');
  });

  it('REFUSES to grade against a body nobody measured', () => {
    // computeTargets fills in a reference body and reports what it invented.
    // Scoring a real day against a stranger's targets is worse than saying
    // nothing, because the sentence reads as a verdict on the citizen.
    const v = dayBalance(day(45, 200, 60), T, ['weightKg', 'sex']);
    expect(v).toEqual({ kind: 'ungraded', reason: 'assumed' });
    expect(balanceNote(v)).toContain('assume an average body');
  });

  it('grades normally when the assumed list is present and empty', () => {
    expect(dayBalance(day(100, 200, 60), T, [])).toEqual({ kind: 'balanced' });
  });

  it('is ungraded rather than wrong when a target is missing or zero', () => {
    expect(dayBalance(day(100, 200, 60), null).kind).toBe('ungraded');
    expect(dayBalance(null, T).kind).toBe('ungraded');
    expect(dayBalance(day(100, 200, 60), { protein: 0, carb: 200, fat: 60 }).kind).toBe('ungraded');
  });
});

describe('balanceNote', () => {
  it('says what landed, not a number', () => {
    expect(balanceNote({ kind: 'balanced' })).toBe('Protein, carbs and fat all land where they should today.');
    expect(balanceNote({ kind: 'balanced' })).not.toMatch(/\d/);
  });

  it('does not promise the rest is fine when nothing is', () => {
    const all = balanceNote({ kind: 'off', short: ['protein', 'carbs', 'fat'], over: [] });
    expect(all).toBe('Today is light on protein, carbs and fat.');
    expect(all).not.toContain('the rest');
  });

  it('promises it when there is a rest', () => {
    expect(balanceNote({ kind: 'off', short: ['fat'], over: [] })).toContain('the rest lands where it should');
  });
});
