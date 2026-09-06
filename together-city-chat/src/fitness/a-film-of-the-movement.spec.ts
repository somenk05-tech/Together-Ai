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

  it('are the two the owner shot first', () => {
    expect(exerciseById('hip-opener')?.video).toBe('/assets/workout/hip-opener.mp4');
    expect(exerciseById('calf-stretch')?.video).toBe('/assets/workout/calf-stretch.mp4');
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
