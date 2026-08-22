import { violations, inVoice, acceptOrFallback } from './voice';
import { violations as cityViolations } from '../shared/voice';

/**
 * Mira relaxes exactly one family of the city voice rules, and no more.
 *
 * The relaxation is done by matching the `why` strings that shared/voice.ts
 * attaches to its rules, which means a rename over there silently widens or
 * narrows what Mira may say. These tests are the tripwire for that: they assert
 * both halves — that the speaker family is gone, and that every honesty family
 * survives — so the coupling cannot rot quietly.
 */
describe('Mira may be a speaker', () => {
  // The exact lines from the spec's required register. Every one of these is
  // rejected by shared/voice.ts, and all of them are Mira at her most
  // characteristic. If this block ever fails, she has lost her voice.
  const HERS = [
    "I can't do that from here.",
    "I've got it. You don't need to worry about that any more.",
    'Give me a second.',
    "I'm listening. Start from the beginning.",
    "I'm not going to answer that one, and not because I'm dodging.",
    'I found something better — want it?',
    "I hope he's okay.",
    "I don't sleep, so I have absolutely no excuse for forgetting this.",
  ];

  it.each(HERS)('allows %j', (line) => {
    expect(violations(line)).toEqual([]);
  });

  // Named rather than counted. The first draft of this test asserted "at least
  // four of those are rejected by the city rules" and it failed: only two are.
  // The count was a guess about someone else's regexes, and a guess is exactly
  // what a test is for. These two are the load-bearing disagreement — both are
  // Mira at her most characteristic, and both are fatal under shared/voice.ts.
  const CITY_REJECTS = [
    "I can't do that from here.",
    "I don't sleep, so I have absolutely no excuse for forgetting this.",
  ];

  it.each(CITY_REJECTS)('the city rules reject %j — Mira does not', (line) => {
    expect(cityViolations(line).length).toBeGreaterThan(0);
    expect(violations(line)).toEqual([]);
  });

  it('the relaxation is exactly one family wide', () => {
    // Every city rejection of one of Mira's lines must be a speaker rule. If a
    // line of hers is ever rejected for an HONESTY reason, the relaxation has
    // been widened by accident and this fails.
    const SPEAKER = new Set([
      'speaks as an assistant',
      'makes the assistant the subject',
      "offers the assistant's perspective",
      'makes the assistant the recommender',
      'narrates the assistant',
    ]);
    for (const line of HERS) {
      for (const v of cityViolations(line)) expect(SPEAKER.has(v.why)).toBe(true);
    }
  });
});

describe('every honesty rule survives', () => {
  // None of these are about the speaker, so none of them are relaxed. Mira
  // being a character does not license her to invent comfort.
  const STILL_FATAL: Array<[string, string]> = [
    ['clinical reassurance', "Your results are fine, there's nothing to worry about."],
    ['dismisses a feeling', "Don't worry about the appointment."],
    ['reassurance as fact', 'This is completely normal.'],
    ['third person', 'The user should check their inbox.'],
    ['addresses a category', 'Users should update their details.'],
    ['stock filler', 'It is important to note that the table is held for an hour.'],
    ['essay scaffolding', 'In conclusion, Saturday works.'],
    ['names its own inputs', 'Based on the data provided, Thursday is free.'],
  ];

  it.each(STILL_FATAL)('still rejects %s', (_why, line) => {
    expect(violations(line).length).toBeGreaterThan(0);
  });
});

describe('service-desk enthusiasm', () => {
  const REJECTED = [
    'Absolutely! Booking that now.',
    'Certainly, one moment.',
    'Of course! Table for four.',
    'Great question.',
    "Happy to help with that.",
    'Is there anything else I can help you with?',
    'How can I help you today?',
    'Here are three recommendations for dinner.',
    'Based on your query, Saturday is free.',
    "I'll go ahead and book that.",
    'Searching the database for recipes.',
    'I sincerely apologise for the confusion.',
    'Sorry about the mix-up.',
  ];

  it.each(REJECTED)('rejects %j', (line) => {
    expect(inVoice(line)).toBe(false);
  });

  it('accepts the terse equivalent of each', () => {
    // The point of banning a phrase is that a better one exists. If any of
    // these ever failed, the ban would be costing correctness rather than
    // buying character.
    const BETTER = [
      'Yeah, I can do that.',
      'Give me a second.',
      'Table for four. Book it?',
      'Three that fit. Which way are you leaning?',
      "Oops. That's on me — I picked Saturday instead of Sunday. Fixing it.",
      "Done. Tomorrow between four and six.",
    ];
    for (const line of BETTER) expect(violations(line)).toEqual([]);
  });
});

describe('acceptOrFallback', () => {
  const FALLBACK = 'Booked.';

  it('keeps prose that stays in voice', () => {
    expect(acceptOrFallback("Booked. It's in your calendar.", FALLBACK)).toBe("Booked. It's in your calendar.");
  });

  it('falls back when the model drifts into a call centre', () => {
    expect(acceptOrFallback('Absolutely! Your booking is confirmed.', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back on empty', () => {
    expect(acceptOrFallback(undefined, FALLBACK)).toBe(FALLBACK);
    expect(acceptOrFallback('   ', FALLBACK)).toBe(FALLBACK);
  });

  it('has NO minimum length, unlike the city helper', () => {
    // shared/acceptOrFallback rejects anything under 40 characters, which is
    // correct for a paragraph of prose and catastrophic here: Mira's best
    // answers are the shortest ones. "Oh." is in the spec.
    for (const short of ['Oh.', 'Yeah.', 'Sent.', 'Booked.', 'Again?']) {
      expect(acceptOrFallback(short, FALLBACK)).toBe(short);
    }
  });
});
