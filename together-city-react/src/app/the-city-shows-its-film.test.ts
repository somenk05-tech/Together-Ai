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

  it('repeats as a REEL, not as one clip — `loop` had to come off (owner, 8 Sep)', () => {
    /* THIS ASSERTION WAS THE OPPOSITE ON 8 SEP AND IS THE SAME DECISION.
       The ask was "keep the film on loop" and the answer was <video loop>,
       which is the browser's own one-clip repeat. The ask is now "add this
       video after this video ends and keep both on loop", and `loop` is the
       one thing preventing it: a looping element rewinds its own file and
       never fires `ended`. So the repeat moved up a level — a list of films,
       `ended` advancing the index, the index wrapping — and the attribute
       that used to carry it must NOT come back. */
    const film = home.slice(home.indexOf('<video'), home.indexOf('</video>'));
    for (const attr of ['autoPlay', 'muted', 'playsInline']) {
      expect({ attr, on: film.includes(attr) }).toEqual({ attr, on: true });
    }
    expect(film).not.toMatch(/^\s*loop\s*$/m);
    expect(film).toMatch(/onEnded=/);
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
    /* THE GEOMETRY MOVED UP A CLASS (9 Sep) and that is the assertion, not a
       loosening of it. A second control arrived on the picture and the owner
       asked for it "the same size, at the same level" — an instruction to
       SHARE the box rather than copy it. `.cinema-key` is the glass; the two
       named classes are only where each sits. Both discs are checked here, so
       one of them drifting is still a failure. */
    const css = read('index.css');
    const rule = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    expect(rule('.cinema-key {')).toMatch(/width: 32px; height: 32px/);
    expect(rule('.cinema-key {')).not.toMatch(/text-transform/);
    for (const cls of ['cinema-sound', 'cinema-num']) {
      expect({ cls, wearsTheGlass: cinema.includes(`cinema-key ${cls}`) }).toEqual({ cls, wearsTheGlass: true });
    }
    // …and they sit on the same line, at opposite edges.
    expect(rule('.cinema-sound {')).toMatch(/right: 12px; bottom: 12px/);
    expect(rule('.cinema-reel {')).toMatch(/left: 12px; bottom: 12px/);
  });

  it('has two controls on the picture: the sound, and which film', () => {
    /* IT WAS ONE UNTIL 9 SEP — "no scrub bar, no play button, no fullscreen:
       the film loops by itself and the only thing a citizen can want from it
       is to hear it or not." The reel is what changed that. With two films
       running one after the other there IS a second thing to want, and it is
       the one thing a set that only moves forwards cannot give you: the film
       you have already gone past.

       The rule underneath is unchanged and still worth holding — no transport
       controls. A scrub bar, a play button or a fullscreen key would turn a
       hero into a player, which is a different thing on a home page. */
    const cinema = home.slice(home.indexOf('<div className="cinema">'), home.indexOf('{/* ============ WELCOME'));
    // One sound disc, and one number per film.
    expect((cinema.match(/<button/g) ?? []).length).toBe(2);
    expect(cinema).toMatch(/\{FILMS\.length > 1 && \(/);
    expect(cinema).toMatch(/onClick=\{\(\) => setClip\(i\)\}/);
    for (const no of ['scrub', 'seek', 'currentTime =', 'requestFullscreen']) {
      expect({ no, drawn: cinema.includes(no) }).toEqual({ no, drawn: false });
    }
  });

  it('ships BOTH films, their phone cuts and their posters', () => {
    for (const f of ['public/assets/video/together-city-commercial.mp4',
      'public/assets/video/together-city-commercial-phone.mp4',
      'public/assets/img/together-city-commercial.webp',
      'public/assets/video/together-city-commercial-2.mp4',
      'public/assets/video/together-city-commercial-2-phone.mp4',
      'public/assets/img/together-city-commercial-2.webp']) {
      expect({ f, there: existsSync(join(APP, f)) }).toEqual({ f, there: true });
    }
    /* The poster is the film's OWN first frame — a poster from another picture
       is a page that changes its mind a second after it loads. It is written
       per film now (`poster={img(f.poster)}`) rather than as one literal, so
       the pairing is checked in the array where it is made. */
    expect(home).toMatch(/poster=\{img\(f\.poster\)\}/);
    expect(home).toMatch(/poster: 'together-city-commercial\.webp'/);
    expect(home).toMatch(/poster: 'together-city-commercial-2\.webp'/);
    for (const p of ['public/assets/img/together-city-commercial.webp',
      'public/assets/img/together-city-commercial-2.webp']) {
      expect(statSync(join(APP, p)).size).toBeLessThan(300 * 1024);
    }
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
