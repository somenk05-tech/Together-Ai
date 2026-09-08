import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE CITY SHOWS ITS FILM — owner, 8 Sep: "replace the city video with this
 * commercial video with audio and with the mute button for the user, the
 * commercial video should play in loop."
 *
 * The page opened on a CGI pavilion city: fifteen lit billboards, ten
 * invisible click zones cut to its buildings, and a silent loop behind them.
 * It opens on thirty seconds of a street now, and the city's promise is said
 * out loud at the end of it.
 */
describe('the film on the home page', () => {
  const home = read('pages/Home.tsx');

  it('loops, plays inline, and starts muted — because every browser refuses otherwise', () => {
    const film = home.slice(home.indexOf('<video'), home.indexOf('</video>'));
    for (const attr of ['autoPlay', 'muted', 'loop', 'playsInline']) {
      expect({ attr, on: film.includes(attr) }).toEqual({ attr, on: true });
    }
    // A page that shouted at its first visitor would deserve the refusal.
    expect(film).toMatch(/poster=/);
  });

  it('offers the sound rather than taking it, and reads the element back', () => {
    /* The button's label follows the video's own `muted` property instead of a
       state variable set beside it — two sources of truth is how a control ends
       up saying "Sound on" over a silent film. */
    expect(home).toMatch(/el\.muted = !el\.muted/);
    expect(home).toMatch(/setSound\(!el\.muted\)/);
    expect(home).toMatch(/aria-label=\{sound \? 'Mute the film' : 'Play the film with sound'\}/);
  });

  it('is a mark at the edge, not a caption on the film (owner, 8 Sep)', () => {
    /* It shipped as a pill with SOUND OFF tracked out beside the glyph. A
       crossed-out speaker is the one icon nobody has to be told the meaning
       of, so the word came off and the control is a 32px disc in the corner —
       the sentence survives where it is actually needed, in aria-label. */
    const cinema = home.slice(home.indexOf('<div className="cinema">'), home.indexOf('{/* ============ WELCOME'));
    expect(cinema).not.toMatch(/Sound off<\/span>|>\{sound \? 'Sound on'/);
    expect(cinema).toMatch(/aria-label=\{sound \? 'Mute the film'/);
    const css = read('index.css');
    const rule = css.slice(css.indexOf('.cinema-sound {'), css.indexOf('}', css.indexOf('.cinema-sound {')));
    expect(rule).toMatch(/width: 32px; height: 32px/);
    expect(rule).not.toMatch(/text-transform/);
  });

  it('has one control on the picture, and it is the sound', () => {
    // No scrub bar, no play button, no fullscreen: the film loops by itself and
    // the only thing a citizen can want from it is to hear it or not.
    const cinema = home.slice(home.indexOf('<div className="cinema">'), home.indexOf('{/* ============ WELCOME'));
    expect((cinema.match(/<button/g) ?? []).length).toBe(1);
  });

  it('ships the film, its phone cut and its poster', () => {
    for (const f of ['public/assets/video/together-city-commercial.mp4',
      'public/assets/video/together-city-commercial-phone.mp4',
      'public/assets/img/together-city-commercial.webp']) {
      expect({ f, there: existsSync(join(APP, f)) }).toEqual({ f, there: true });
    }
    // The poster is the film's own first frame. A poster from another picture
    // is a page that changes its mind a second after it loads.
    expect(home).toMatch(/poster=\{img\('together-city-commercial\.webp'\)\}/);
    expect(statSync(join(APP, 'public/assets/img/together-city-commercial.webp')).size).toBeLessThan(300 * 1024);
  });

  it('leaves SignIn its own loop, which is a backdrop and not a message', () => {
    // The 9–15 MB pavilion loop is still the right thing behind a form, and
    // still gated at 900px there. Nothing about this touched it.
    expect(read('features/auth/pages/SignIn.tsx')).toMatch(/together-city-loop\.mp4/);
    expect(existsSync(join(APP, 'public/assets/video/together-city-loop.mp4'))).toBe(true);
  });

  it('took the clickable buildings off with the render they were measured against', () => {
    /* Ten polygons and an ellipse, in the coordinates of a CGI city that is no
       longer underneath them. Over live footage each one is a trap: an
       invisible rectangle that opens Medical when somebody clicks a car. The
       ten hubs keep the walk, the foot grid, Personalize, the palette, their
       switch on Design Your Services and their route. */
    expect(home).not.toMatch(/const ZONES/);
    expect(home).not.toMatch(/className="bmap"/);
    expect(home).not.toMatch(/citymap/);
    // and the foot grid, which is the door that replaced it, still stands
    expect(home).toMatch(/const PAVILIONS: Pavilion\[\] = \[/);
  });
});
