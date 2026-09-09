import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { LIBRARY, exerciseById } from './exercise-library';
import { buildSession } from './session-engine';

/**
 * A FILM OF THE MOVEMENT — owner, 6 Sep: "add the workout videos next to the
 * workout as a video link, and when someone presses start, play the video on
 * repeat until the timer is on, with the audio, full screen."
 *
 * The library carries the city's own clip where one has been shot, the
 * session carries it to the runner, and every path names a file that
 * actually ships with the web app — a link to a film that is not there is the
 * one thing worse than no link.
 */

const WEB_PUBLIC = join(__dirname, '..', '..', '..', 'together-city-react', 'public');

describe('the films the library names', () => {
  const filmed = LIBRARY.filter((e) => e.video);

  it('exist, ship with the web app, and are small enough to loop on a phone', () => {
    expect(filmed.length).toBeGreaterThanOrEqual(2);
    for (const e of filmed) {
      expect(e.video).toMatch(/^\/assets\/workout\/[a-z0-9-]+\.mp4$/);
      const file = join(WEB_PUBLIC, e.video!);
      expect({ id: e.id, exists: existsSync(file) }).toEqual({ id: e.id, exists: true });
      expect(statSync(file).size).toBeLessThan(4_000_000);
    }
  });

  it('are the ones the owner has actually shot', () => {
    expect(exerciseById('hip-opener')?.video).toBe('/assets/workout/hip-opener.mp4');
    expect(exerciseById('calf-stretch')?.video).toBe('/assets/workout/calf-stretch.mp4');
    /* THE THIRD, 9 SEP — and it is here because of what it is NOT. The clip
       arrived called a sissy squat. It shows a plain bodyweight squat: heels
       flat, hips travelling back, torso upright, which is the opposite shape
       to a sissy squat in every one of those three respects. Filed under the
       movement it shows, the film is worth having; filed under the name it
       came with, it would have printed "rise onto your toes and lean back"
       over somebody sitting into a normal squat. */
    expect(exerciseById('bw-squat')?.video).toBe('/assets/workout/bw-squat.mp4');
  });

  it('leave the sissy squat waiting for a film of a sissy squat', () => {
    const sissy = exerciseById('sissy-squat');
    expect(sissy).toBeDefined();
    expect(sissy?.video).toBeUndefined();
    /* The rule this file has held since 6 Sep, stated the other way round: a
       link to a film that is not there is the one thing worse than no link,
       and a link to a film of a DIFFERENT MOVEMENT is worse than both. */
    expect(sissy?.video).not.toBe(exerciseById('bw-squat')?.video);
  });
});

describe('the sissy squat says what it is and who should not do it', () => {
  const sissy = exerciseById('sissy-squat');

  it('is a squat-pattern quad movement that needs nothing', () => {
    expect(sissy?.pattern).toBe('squat');
    expect(sissy?.muscles).toEqual(['quads']);
    expect(sissy?.equipment).toEqual([]);
  });

  it('carries its own words rather than borrowing the catalogue\'s', () => {
    /* The catalogue names it only with apparatus attached — a bench, a
       sissy-squat frame — so "hook your feet under the pad" would be printed
       at somebody standing in their front room. That is the borrowed-
       instructions lie the library was built to refuse. */
    expect(sissy?.datasetId).toBeUndefined();
    expect(sissy?.steps?.length).toBeGreaterThanOrEqual(4);
    /* The two cues that separate it from every other squat in here. */
    expect(sissy?.steps?.join(' ')).toMatch(/balls of your feet/i);
    expect(sissy?.steps?.join(' ')).toMatch(/lean your upper body back/i);
  });

  it('is withheld from a painful knee, and names its stand-in', () => {
    /* Deep loaded knee flexion with the shin far past vertical is the classic
       caution here, and this library takes the cautious side where the reading
       is arguable. The swap is the same pattern and the same muscles without
       the shear, so the block is substituted rather than dropped and the
       session does not come up short. */
    expect(sissy?.avoidWith).toContain('jointPain');
    expect(sissy?.swapFor).toBe('bw-squat');
  });
});

describe('the session carries the film to the runner', () => {
  it('names the film on a filmed movement and nothing on the rest', () => {
    const s = buildSession({
      minutes: 45, location: 'home', equipment: [], level: 'intermediate', bodyGoal: 'athletic',
      conditions: [], intensityCap: 'vigorous', kcalTarget: 2455, proteinG: 74, nutritionGoal: 'lose',
      weightKg: 78, recent: { sessionsLast7: 0, minutesLast7: 0, daysSinceLast: null },
      limitations: null, missing: [],
    });
    const all = s.blocks.flatMap((b) => b.exercises);
    expect(all.length).toBeGreaterThan(3);
    for (const ex of all) {
      expect(typeof ex.video).toBe('string');
      const lib = exerciseById(ex.id);
      expect(ex.video).toBe(lib?.video ?? '');
    }
  });
});
