import {
  newSession, begin, hear, answer, spoken, end, secondsLeft, elapsedSeconds, meteredSeconds, closingFor,
  DISCLOSURE, CLOSING, VOICE_LANGUAGES, isVoiceLanguage, DEFAULT_LANGUAGE,
  type SpokenLanguage,
} from './voice-session';
import {
  CALL_PRICE_INR_PER_MINUTE, CALL_WARN_AT_SECONDS, MAX_CALL_MINUTES, MIN_BALANCE_INR,
  priceForMinutes, minutesAfforded, costSoFarInr, voiceQuotaFor,
} from './voice-quota';

/**
 * ── SHE SAYS WHAT SHE IS, FIRST, ALWAYS ─────────────────────────────────────
 *
 * The brief was "an AI astrologer who sounds exactly like a real woman". She
 * does — that is what the voice budget buys. Which is exactly the case India's
 * IT Rules as amended in February 2026 (G.S.R. 120(E)) name: synthetic audio
 * "likely to be perceived as indistinguishable from a natural person" must
 * carry "a prominently prefixed audio disclosure". ElevenLabs' use policy
 * requires the same of anyone shipping on it.
 *
 * So the disclosure is not a setting, a flag or a first-run notice. It is the
 * only exit from the `opening` phase, and these cases exist so that stays true
 * when somebody adds a "skipIntro" parameter in a hurry.
 *
 * ── AND THE METER STARTS WHEN THE CITIZEN DOES ──────────────────────────────
 *
 * ₹99 a minute (owner, 4 Sep). Three rules follow, and each is here because
 * the alternative is a chargeback:
 *
 *   1. THE DISCLOSURE IS FREE. `meterFrom` is null until the citizen's first
 *      word, so the sentence the law requires is not a sentence they paid for.
 *   2. WHOLE MINUTES, STARTED. Ninety seconds is two. It is the convention
 *      every Indian telecom and astrology app bills on, and the only rule that
 *      can be explained at the door.
 *   3. THE END IS ANNOUNCED. A minute out, once, in front of the reply — never
 *      a cut mid-sentence.
 */
const T0 = 1_800_000_000_000;
const at = (sec: number) => T0 + sec * 1000;
/** A call the wallet funded for five minutes — ₹495. */
const opened = (minutes = 5) => begin(newSession(T0, 'en-IN', minutes)).session;

describe('she says what she is, first, always', () => {
  it('opens on a session that has said nothing', () => {
    const s = newSession(T0, 'en-IN', 5);
    expect(s.phase).toBe('opening');
    expect(s.disclosed).toBe(false);
    expect(s.turns).toBe(0);
    expect(s.meterFrom).toBeNull();
  });

  it('will not hear a word before the disclosure is spoken', () => {
    const r = hear(newSession(T0, 'en-IN', 5), at(1), 'when will I marry');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/disclosure/);
    expect(r.session.turns).toBe(0);
  });

  it('leaves `opening` only by saying it, and says it in the caller’s language', () => {
    for (const lang of VOICE_LANGUAGES.filter((l) => l !== 'auto') as SpokenLanguage[]) {
      const { session, say } = begin(newSession(T0, lang, 5));
      expect(say).toBe(DISCLOSURE[lang]);
      expect(session.disclosed).toBe(true);
      expect(session.phase).toBe('listening');
    }
  });

  it('cannot be opened twice — there is no second, quieter opening', () => {
    expect(() => begin(opened())).toThrow();
  });

  it('has a real sentence for every language it offers', () => {
    for (const lang of Object.keys(DISCLOSURE) as SpokenLanguage[]) {
      expect(DISCLOSURE[lang].length).toBeGreaterThan(40);
      expect(CLOSING[lang].length).toBeGreaterThan(20);
    }
  });

  it('resolves `auto` to a language it can actually speak', () => {
    expect(newSession(T0, 'auto', 5).language).toBe(DEFAULT_LANGUAGE);
    expect(DISCLOSURE[DEFAULT_LANGUAGE]).toBeTruthy();
  });

  it('accepts only languages it has a voice for', () => {
    expect(isVoiceLanguage('hi-IN')).toBe(true);
    expect(isVoiceLanguage('fr-FR')).toBe(false);
    expect(isVoiceLanguage(7)).toBe(false);
  });
});

describe('the disclosure is free', () => {
  it('does not start the meter — she can say who she is for as long as it takes', () => {
    const s = opened();
    expect(s.meterFrom).toBeNull();
    expect(meteredSeconds(s, at(30))).toBe(0);
    expect(costSoFarInr(meteredSeconds(s, at(30)))).toBe(0);
    // Thirty seconds of greeting has spent none of the five funded minutes.
    expect(secondsLeft(s, at(30))).toBe(5 * 60);
  });

  it('starts on the citizen’s first word, and never moves after', () => {
    let s = opened();
    const first = hear(s, at(20), 'tell me about my career');
    expect(first.ok).toBe(true);
    expect(first.session.meterFrom).toBe(at(20));

    s = spoken(answer(first.session, at(24), 'Your tenth house is busy.').session);
    const second = hear(s, at(40), 'and my marriage');
    expect(second.session.meterFrom).toBe(at(20));
  });

  it('counts the meter from the first word, not from the call', () => {
    const s = hear(opened(), at(20), 'hello').session;
    expect(elapsedSeconds(s, at(80))).toBe(80);
    expect(meteredSeconds(s, at(80))).toBe(60);
  });
});

describe('whole minutes, started', () => {
  it('charges a minute for a second, and two for ninety seconds', () => {
    expect(costSoFarInr(0)).toBe(0);
    expect(costSoFarInr(1)).toBe(CALL_PRICE_INR_PER_MINUTE);
    expect(costSoFarInr(60)).toBe(CALL_PRICE_INR_PER_MINUTE);
    expect(costSoFarInr(90)).toBe(2 * CALL_PRICE_INR_PER_MINUTE);
    expect(costSoFarInr(300)).toBe(5 * CALL_PRICE_INR_PER_MINUTE);
  });

  it('prices a block of minutes the same way the meter does', () => {
    expect(priceForMinutes(1)).toBe(99);
    expect(priceForMinutes(5)).toBe(495);
    expect(priceForMinutes(0)).toBe(0);
  });

  it('floors what a balance affords — a part minute is never sold', () => {
    expect(minutesAfforded(0)).toBe(0);
    expect(minutesAfforded(98)).toBe(0);
    expect(minutesAfforded(99)).toBe(1);
    expect(minutesAfforded(197)).toBe(1);
    expect(minutesAfforded(495)).toBe(5);
  });

  it('never funds more than the safety stop, however deep the wallet', () => {
    expect(minutesAfforded(1_000_000)).toBe(MAX_CALL_MINUTES);
    expect(newSession(T0, 'en-IN', 999).fundedMinutes).toBe(MAX_CALL_MINUTES);
  });
});

describe('the end arrives announced', () => {
  it('warns once, a minute out, in front of the reply', () => {
    let s = hear(opened(), at(0), 'go on').session;
    const late = at(5 * 60 - CALL_WARN_AT_SECONDS);
    const first = answer(s, late, 'Jupiter turns direct next month.');
    expect(first.say).toHaveLength(2);
    expect(first.say[1]).toBe('Jupiter turns direct next month.');
    expect(first.session.warned).toBe(true);

    s = spoken(first.session);
    expect(answer(s, late + 1000, 'And Saturn steadies it.').say).toHaveLength(1);
  });

  it('does not warn while there is plenty of balance', () => {
    const s = hear(opened(), at(0), 'go on').session;
    const r = answer(s, at(10), 'Tell me about the year ahead.');
    expect(r.say).toHaveLength(1);
    expect(r.session.warned).toBe(false);
  });

  it('does not warn before the meter has started — nothing is counting down', () => {
    const r = answer(opened(), at(9_999), 'Namaste again.');
    expect(r.say).toHaveLength(1);
    expect(r.session.warned).toBe(false);
  });

  it('refuses the turn when the balance is spent, and closes the call itself', () => {
    const s = hear(opened(), at(0), 'first').session;
    const r = hear(s, at(5 * 60 + 1), 'one more thing');
    expect(r.ok).toBe(false);
    expect(r.session.phase).toBe('ended');
    expect(r.session.endedReason).toBe('out-of-balance');
    expect(closingFor('en-IN')).toBe(CLOSING['en-IN']);
  });

  it('will not open a call the wallet cannot fund for a single minute', () => {
    const r = hear(begin(newSession(T0, 'en-IN', 0)).session, at(1), 'hello');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/balance/);
    expect(r.session.endedReason).toBe('out-of-balance');
  });

  it('does not extend a running call when the wallet is topped up mid-call', () => {
    // fundedMinutes is fixed at open, deliberately — a balance that moves under
    // a running meter is the race wallet-race.spec.ts exists about.
    const s = hear(opened(2), at(0), 'go on').session;
    expect(s.fundedMinutes).toBe(2);
    expect(secondsLeft(s, at(60))).toBe(60);
  });

  it('refuses everything once ended, and a second hang-up is not an error', () => {
    const done = end(opened(), 'hung-up');
    expect(hear(done, at(2), 'hello?').ok).toBe(false);
    expect(end(done, 'out-of-balance')).toBe(done);
    expect(spoken(done).phase).toBe('ended');
  });

  it('counts a turn only when she actually answers', () => {
    const h = hear(opened(), at(5), 'what about my career');
    expect(h.ok).toBe(true);
    expect(h.session.turns).toBe(0);
    expect(answer(h.session, at(6), 'Your tenth house is busy.').session.turns).toBe(1);
  });

  it('hears nothing in silence — and silence does not start the meter', () => {
    const r = hear(opened(), at(3), '   ');
    expect(r.ok).toBe(false);
    expect(r.session.meterFrom).toBeNull();
  });
});

describe('what the screen is told before the citizen calls', () => {
  it('says the rate, the balance and what it buys', () => {
    const q = voiceQuotaFor(0, 495, true);
    expect(q.rateInr).toBe(CALL_PRICE_INR_PER_MINUTE);
    expect(q.balanceInr).toBe(495);
    expect(q.minutesAfforded).toBe(5);
    expect(q.canStart).toBe(true);
    expect(q.blockedBy).toBe('none');
  });

  it('names the reason it cannot start, rather than leaving the screen to guess', () => {
    expect(voiceQuotaFor(0, 50, true)).toMatchObject({ canStart: false, blockedBy: 'balance' });
    expect(voiceQuotaFor(0, 5_000, false)).toMatchObject({ canStart: false, blockedBy: 'till-closed' });
  });

  it('needs a whole minute in the wallet to start at all', () => {
    expect(MIN_BALANCE_INR).toBe(CALL_PRICE_INR_PER_MINUTE);
    expect(voiceQuotaFor(0, MIN_BALANCE_INR - 1, true).canStart).toBe(false);
    expect(voiceQuotaFor(0, MIN_BALANCE_INR, true).canStart).toBe(true);
  });

  it('counts calls up and never down', () => {
    expect(voiceQuotaFor(-3, 495, true).taken).toBe(0);
    expect(voiceQuotaFor(2.7, 495, true).taken).toBe(2);
  });
});
