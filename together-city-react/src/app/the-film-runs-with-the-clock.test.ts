import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE FILM RUNS WITH THE CLOCK — owner, 6 Sep: "add the workout videos next to
 * the workout as a video link, and when someone presses start, play the video
 * on repeat until the timer is on, with the audio, full screen."
 *
 * Read off the runner's source: the film is behind the countdown, looping,
 * with its sound (no `muted`), never on a rest step, started from the tap on
 * Start and stopped with the session; the plan lists it as a link beside the
 * movement; and the two clips the owner shot ship with the app.
 */

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const page = read('features/fitness/pages/Workout.tsx');

describe('on the runner', () => {
  it('is the television: the set\'s own room and screen, the film edge to edge, on a loop, with its sound', () => {
    // Owner, 6 Sep: "use the Together City TV format for this section, with
    // the timer and the workout text on the side."
    expect(page).toMatch(/<div className="tv-room wk-run">/);
    expect(page).toMatch(/<video key=\{filmSrc\} ref=\{film\} className="tv-media" src=\{filmSrc\} loop playsInline/);
    expect(page).not.toMatch(/<video[^>]*\bmuted\b/);
    const social = read('styles/social.css');
    expect(social).toMatch(/\.tv-media \{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain/);
  });

  it('is portalled to the body, with the words and the clock in the caption band and the keys on the remote', () => {
    // Owner, 6 Sep: "no white zone, everything below the full-screen video,
    // uniform, TV format with a timer." The shell's column is a containing
    // block; a fixed room inside it was a television in a box.
    expect(page).toMatch(/running && s && createPortal\(/);
    expect(page).toMatch(/\n {8}document\.body,\n {6}\)\}/);
    expect(page).toMatch(/<div className="tv-room-top">/);
    expect(page).toMatch(/<div className="tv-caption wk-cap"/);
    for (const part of ['wk-cap-name', 'wk-cap-target', 'wk-cap-next', 'wk-cap-clock', 'wk-cap-steps']) {
      expect(page).toMatch(new RegExp(`className="${part}"`));
    }
    expect(page).toMatch(/<div className="tv-bar wk-bar">/);
    expect(page).toMatch(/<div className="tv-progress" aria-hidden>/);
    // The runner brings no room, screen or remote of its own — the set's are the set's.
    const css = read('styles/layout.css');
    expect(css).not.toMatch(/^\.wk-run \{|^\.wk-side \{|^\.wk-film \{/m);
  });

  it('keeps step with the clock: never on a rest, paused with it, from the top on the next', () => {
    expect(page).toMatch(/const filmSrc = running && s && !s\.rest \? s\.video : undefined;/);
    expect(page).toMatch(/if \(paused\) \{ el\.pause\(\); return; \}/);
    expect(page).toMatch(/el\.play\(\)\.catch\(\(\) => setNeedsTap\(true\)\)/);
    // `key={filmSrc}` remounts the element when the film changes, so a new
    // step's clip starts at zero rather than wherever the last one was.
    expect(page).toMatch(/key=\{filmSrc\}/);
  });

  it('asks for the whole screen from the tap on Start, and gives it back at the end', () => {
    const start = page.slice(page.indexOf('const start = ('), page.indexOf('const finish = ('));
    expect(start).toMatch(/requestFullscreen\?\.\(\)/);
    const finish = page.slice(page.indexOf('const finish = ('), page.indexOf('const finish = (') + 600);
    expect(finish).toMatch(/exitFullscreen\(\)/);
  });

  it('offers a tap where a browser will not start sound on its own', () => {
    expect(page).toMatch(/className="tv-sound"/);
  });
});

describe('on the plan', () => {
  it('lists the film as a link beside the movement, only where one exists', () => {
    expect(page).toMatch(/\{video && <a className="wk-film-link" href=\{video\} target="_blank" rel="noopener"/);
    expect(page).toMatch(/ex\.video \|\| undefined,/);
  });
});

describe('the films ship', () => {
  it('both clips the owner shot are in the app, as MP4', () => {
    for (const id of ['hip-opener', 'calf-stretch']) {
      expect({ id, shipped: existsSync(join(SRC, '..', 'public', 'assets', 'workout', `${id}.mp4`)) }).toEqual({ id, shipped: true });
    }
  });
});
