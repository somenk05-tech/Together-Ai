import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickVoice } from '@/features/chat/mira/voice';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

/**
 * SHE SPEAKS ON THE PLATFORM'S OWN ENGINE, AND IT IS FREE.
 *
 * `Mira-Voice-Cost.md` priced the alternative: ElevenLabs at ten thousand
 * monthly citizens is about $24,500 a month — eleven times the entire backend.
 * The designed voice is a recording session and a fine-tune, and it is phase 3.
 * This is the placeholder, and the tests are about it being an honest one.
 */
describe('she picks the least-wrong voice available', () => {
  it('prefers a named voice over an accent match', () => {
    const voices = [voice('Daniel', 'en-IN'), voice('Veena', 'en-IN'), voice('Alex', 'en-US')];
    expect(pickVoice(voices)?.name).toBe('Veena');
  });

  it('takes the nearest accent when no named voice is installed', () => {
    const voices = [voice('Alex', 'en-US'), voice('Rishi', 'en-IN'), voice('Xander', 'nl-NL')];
    expect(pickVoice(voices)?.lang).toBe('en-IN');
  });

  it('falls through the accent list rather than stopping at the first miss', () => {
    const voices = [voice('Xander', 'nl-NL'), voice('Alex', 'en-US')];
    expect(pickVoice(voices)?.lang).toBe('en-US');
  });

  it('returns something rather than nothing when the list is all foreign', () => {
    expect(pickVoice([voice('Xander', 'nl-NL')])?.name).toBe('Xander');
  });

  it('does not throw on an empty list — some browsers report none until asked twice', () => {
    expect(pickVoice([])).toBeUndefined();
  });
});

/**
 * A VOICE NOTE, NOT AN OPEN MICROPHONE.
 *
 * The first version sent on the recogniser's first final transcript: a pause to
 * think committed half a sentence, and a misheard word went to the server with
 * no chance to fix it. These are source-level assertions because the hook needs
 * a browser and this suite runs in node — but the properties are the ones worth
 * pinning, and each has a specific way of quietly coming back.
 */
describe('the microphone does not send for you', () => {
  const hook = strip(read('src/features/chat/mira/voice.ts'));
  const thread = strip(read('src/features/chat/mira/MiraThread.tsx'));

  /** Without `continuous`, the recogniser ends the session at the first pause —
   *  which is the whole of what made the old one feel like it was interrupting. */
  it('keeps listening through a pause', () => {
    expect(hook).toMatch(/continuous\s*=\s*true/);
  });

  /** The transcript lands in the composer. The extra tap is where you catch
   *  "Piya" for "Priya" — and the day she can act rather than read, that tap is
   *  the difference between the right transfer and the wrong one. */
  it('fills the draft rather than sending', () => {
    const cb = thread.slice(thread.indexOf('useVoiceNote('), thread.indexOf('useVoiceNote(') + 200);
    expect(cb).toMatch(/setDraft/);
    expect(cb).not.toMatch(/\bsend\(/);
  });

  it('stops itself rather than recording until the tab closes', () => {
    expect(hook).toMatch(/MAX_SECONDS\s*=\s*\d+/);
  });

  it('can be thrown away, not only finished', () => {
    expect(hook).toMatch(/cancel:/);
    expect(thread).toMatch(/note\.cancel/);
  });
});

/**
 * AND SHE IS SILENT UNTIL ASKED.
 *
 * Not timidity. A chat surface that starts talking out loud on a phone in a room
 * with other people in it is a betrayal in one second flat, and no amount of
 * good voice design buys that back.
 */
describe('her voice is off until somebody turns it on', () => {
  const hook = strip(read('src/features/chat/mira/voice.ts'));

  it('defaults to off, and reads the stored answer rather than assuming one', () => {
    const init = hook.slice(hook.indexOf('const [on, setOn]'), hook.indexOf('const [speaking'));
    expect(init).toMatch(/getItem\(SPEAK_KEY\)\s*===\s*'1'/);
    expect(init).toMatch(/catch\s*\{\s*return false/);
  });

  /** Chrome returns [] from getVoices() on the first call and fills the list
   *  asynchronously. Asking once at mount silently gets the default voice for
   *  ever — which is the one bug in this file that would never look like one. */
  it('waits for the browser to finish loading its voices', () => {
    expect(hook).toMatch(/onvoiceschanged/);
  });

  /**
   * AND THE ICON IS THE STATE.
   *
   * It shipped as a megaphone — the nearest name Icon.tsx happened to have —
   * and the owner's first question on seeing it was "what does this button
   * do?". That is the only review a control icon ever gets, and it failed. A
   * crossed-out speaker says "she is silent" without a tooltip, a label, or a
   * guess; a megaphone says "broadcast", which is a different feature.
   *
   * Asserted because the failure is silent: an icon that means the wrong thing
   * renders perfectly, passes every type check, and is only ever caught by
   * somebody being confused in front of it.
   */
  it('shows whether she is speaking or silent, in the icon itself', () => {
    const thread = strip(read('src/features/chat/mira/MiraThread.tsx'));
    expect(thread).toMatch(/name=\{speech\.on \? 'speak' : 'mute'\}/);
    const icons = strip(read('src/components/ui/Icon.tsx'));
    expect(icons).toMatch(/speak: Volume2/);
    expect(icons).toMatch(/mute: VolumeX/);
  });

  /** Queueing means an interrupted turn keeps talking over the next one, which
   *  is how a voice becomes something you switch off and never switch back on. */
  it('cancels the previous line before starting a new one', () => {
    const speak = hook.slice(hook.indexOf('const speak ='), hook.indexOf('const hush ='));
    expect(speak.indexOf('speechSynthesis.cancel()')).toBeLessThan(speak.indexOf('new SpeechSynthesisUtterance'));
  });
});
