import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE SESSION IS BUILT, NOT LOOKED UP ─────────────────────────────────────
 *
 * The owner's brief, 16 Aug. What this guards is the frontend half, and it is
 * almost entirely a set of ABSENCE checks, because the failure mode is a table
 * growing back: the page built its own workout for months from three hardcoded
 * arrays and seven inputs, five of them `useState`, and the reason nobody
 * noticed is that a hardcoded workout looks exactly like a computed one.
 *
 * The defect underneath it, which is why the safety assertion is first: the
 * page read no declared condition, so a citizen with joint pain was handed
 * Jump squats and Burpees while the weekly-plan engine three screens away was
 * correctly giving them low-impact cardio.
 */
describe('the workout page draws a session it did not build', () => {
  const page = code('features/fitness/pages/Workout.tsx');
  const api = code('features/fitness/api.ts');
  const profile = code('features/fitness/pages/Profile.tsx');

  it('has no exercise table left in it', () => {
    // The three that were here. A name in a page is a movement nothing can
    // reason about — no equipment, no muscle, and no way to say "not for you".
    for (const gone of ['HOME_PLANS', 'GENDER_HOME', 'GENDER_GYM', 'buildHomeSeq', 'buildGymSeq', 'buildSeq', 'repScheme']) {
      expect({ gone, present: page.includes(gone) }).toEqual({ gone, present: false });
    }
    // And the movements themselves are not in the file under any other name.
    for (const move of ['Jump squat', 'Burpee', 'Jumping jacks', 'Mountain climber']) {
      expect({ move, present: page.includes(move) }).toEqual({ move, present: false });
    }
  });

  it('asks the server for today’s session', () => {
    expect(page).toMatch(/useTodaySession\(dur, loc\)/);
    expect(api).toMatch(/queryKey: \['fitness', 'session', minutes \?\? null, place \?\? null\]/);
    expect(api).toMatch(/'\/fitness\/session'/);
  });

  it('keeps only the two overrides that are about TODAY', () => {
    // Length and place are facts about today. The level, the split, the gender
    // emphasis and the rep scheme were opinions this file held about a citizen
    // whose real answers were saved on the server.
    expect(page).toMatch(/const \[dur, setDur\] = useState<number \| undefined>\(undefined\)/);
    expect(page).toMatch(/const \[loc, setLoc\] = useState<Loc \| undefined>\(undefined\)/);
    expect(page).not.toMatch(/setLevel|setFocus/);
    // …and undefined means "whatever my profile says", not a default chosen here.
    expect(page).toMatch(/training profile/);
  });

  it('shows why the workout looks like this, from named inputs', () => {
    for (const part of ['session.why.goal', 'session.why.energy', 'session.why.activity', 'session.why.ceiling']) {
      expect({ part, shown: page.includes(part) }).toEqual({ part, shown: true });
    }
    // What it did NOT know, with the way to give it — an input nobody was asked
    // for is not personalisation anybody can claim.
    expect(page).toMatch(/session\.why\.missing\.length > 0/);
    expect(page).toMatch(/Not in this yet/);
  });

  it('never swaps a movement silently', () => {
    expect(page).toMatch(/session\.substitutions\.length > 0/);
    expect(page).toMatch(/instead of \{sub\.from\}/);
    expect(page).toMatch(/session\.cautions/);
  });

  it('makes the burn follow the session that was actually built', () => {
    // It was kcalWorkout(WORKOUT_MIN) — the constant 60 — so choosing 45 or 90
    // changed the routine and left the goal, the tiles and the heading all
    // saying sixty. The 743 never moved.
    expect(page).toMatch(/kcalWorkout\(sessionMin, WEIGHT\)/);
    expect(page).toMatch(/kcalWalk\(walkMin, WEIGHT\)/);
    expect(page).not.toMatch(/kcalWorkout\(WORKOUT_MIN/);
  });

  it('logs the intensity that was actually prescribed', () => {
    // Every session was logged 'moderate', including a light one. A history
    // that lies is a history the engine reading it back will act on.
    expect(page).toMatch(/intensity: session\?\.intensity \?\? 'moderate'/);
  });

  it('asks for the training set-up the engine needs', () => {
    for (const field of ['equipment', 'daysPerWeek', 'limitations', 'place', 'sessionMinutes']) {
      expect({ field, asked: profile.includes(field) }).toEqual({ field, asked: true });
    }
    // 'none' is a real answer — "I train with nothing" — and must be offerable,
    // or empty has to mean two different things at once.
    expect(profile).toMatch(/key: 'none', label: 'Nothing — bodyweight'/);
    // The free-text limitation is printed, never interpreted.
    expect(profile).toMatch(/We do not try to interpret it/);
  });

  it('still computes no calorie target of its own', () => {
    // one-energy.test.ts guards the equation; this guards the habit. This page
    // was one of the four original Mifflin-St Jeor offenders.
    expect(page).not.toMatch(/6\.25|[^\d]161[^\d]/);
  });
});
