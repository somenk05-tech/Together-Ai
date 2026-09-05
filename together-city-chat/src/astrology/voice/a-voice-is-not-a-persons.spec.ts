import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NoSpeechProvider, callCostInr, VOICE_UNAVAILABLE } from './speech.provider';

/**
 * ── A VOICE IS NOT A PERSON'S, AND A CLOSED DOOR SAYS SO ────────────────────
 *
 * Two rules that are cheap to keep now and expensive to reinstate later.
 *
 * 1 · THE INTERFACE CANNOT CLONE ANYBODY. Tara is a catalogue voice, selected
 *     by id. There is no field on `SpeakRequest` that takes a recording, and
 *     there must never be one: every vendor worth using prohibits replicating
 *     a real person's voice without their consent (ElevenLabs' use policy and
 *     Cartesia's acceptable-use policy both say so in as many words), and an
 *     interface that cannot express it is a stronger guarantee than a review
 *     that has to remember to look. Licensing a real astrologer's voice is a
 *     signed release and a deliberate new interface, not a field.
 *
 * 2 · NO VENDOR MEANS NO CALL, SAID OUT LOUD. `NoSpeechProvider` is bound
 *     until a vendor is signed. It refuses with one sentence a citizen can
 *     read, rather than synthesising something — because "something" is a
 *     robot voice sold as a human one for ₹99. This is the same posture the
 *     Till takes: `commerce/sandbox.provider.ts` refuses in production rather
 *     than succeeding a charge nobody made.
 */
describe('a voice is not a person’s', () => {
  /* The COMMENTS in that file name the thing they forbid, so the assertion
     reads the code with them stripped — the same treatment the web ratchets
     give source they assert against. */
  const src = readFileSync(join(__dirname, 'speech.provider.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  it('has no way to hand a vendor a recording of somebody', () => {
    expect(src).not.toMatch(/clone|voiceSample|referenceAudio|speakerAudio/i);
  });

  it('selects a voice by catalogue id and nothing else', () => {
    expect(src).toMatch(/voiceId: string/);
  });

  it('makes both vendors report what they billed, so the ceiling can see the meter', () => {
    expect(src).toMatch(/billedSeconds: number/);
    expect(src).toMatch(/billedCharacters: number/);
  });
});

describe('no vendor means no call, said out loud', () => {
  it('is not ready, and says which it is', () => {
    const p = new NoSpeechProvider();
    expect(p.ready).toBe(false);
    expect(p.name).toBe('none');
  });

  it('refuses to listen and refuses to speak, with a sentence for the citizen', async () => {
    const p = new NoSpeechProvider();
    await expect(p.transcribe()).rejects.toThrow(VOICE_UNAVAILABLE);
    await expect(p.speak()).rejects.toThrow(VOICE_UNAVAILABLE);
  });

  it('points the citizen at the thing that does work', () => {
    expect(VOICE_UNAVAILABLE).toMatch(/written consultation/i);
  });
});

describe('what a call cost us', () => {
  const env = { SPEECH_STT_USD_PER_MIN: '0.0048', SPEECH_TTS_USD_PER_KCHAR: '0.05', USD_INR: '94.43' };

  it('prices a five-minute call from what the vendors said they billed', () => {
    // Five minutes heard, ~2,060 characters spoken back (about half the call).
    const inr = callCostInr(300, 2060, env as NodeJS.ProcessEnv);
    expect(inr).toBeGreaterThan(9);
    expect(inr).toBeLessThan(14);
  });

  it('is zero for a call where nothing was said', () => {
    expect(callCostInr(0, 0, env as NodeJS.ProcessEnv)).toBe(0);
  });

  it('reads its rates from the environment, because a price list in code goes stale', () => {
    const dearer = callCostInr(300, 2060, { ...env, SPEECH_TTS_USD_PER_KCHAR: '0.10' } as NodeJS.ProcessEnv);
    const base = callCostInr(300, 2060, env as NodeJS.ProcessEnv);
    expect(dearer).toBeGreaterThan(base);
  });

  it('ignores a rate that is not a number rather than billing NaN', () => {
    const inr = callCostInr(300, 2060, { ...env, USD_INR: 'soon' } as NodeJS.ProcessEnv);
    expect(Number.isFinite(inr)).toBe(true);
    expect(inr).toBeGreaterThan(0);
  });
});
