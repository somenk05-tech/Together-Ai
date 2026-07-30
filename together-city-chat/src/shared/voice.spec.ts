import { acceptOrFallback, cityVoice, inVoice, violations } from './voice';

describe('the city speaks personally, and does not buy comfort with honesty', () => {
  describe('the assistant is never the subject', () => {
    it.each([
      'As an AI, I can only offer general guidance.',
      "I'm here to help you understand your results.",
      "I can't diagnose this for you.",
      "In my experience, this improves with diet.",
      "I'd recommend speaking to your doctor.",
      'Let me walk you through what this means.',
    ])('rejects %s', (t) => expect(inVoice(t)).toBe(false));
  });

  describe('it talks to one person, not about a category', () => {
    it.each([
      'The user should consult a healthcare professional.',
      'The patient may experience fatigue.',
      'Users can add a blood report at any time.',
      'One might consider increasing iron intake.',
    ])('rejects %s', (t) => expect(inVoice(t)).toBe(false));

    it('accepts the same thing said to them', () => {
      expect(inVoice('Your ferritin is low, which is worth raising with your doctor.')).toBe(true);
    });

    it('leaves a proper noun alone', () => {
      // Found by running the scan over the client: "the User Content Licence"
      // is a document title in the terms of service and is correctly written.
      // A guard that fires on good writing gets switched off.
      expect(inVoice('You grant us the licence set out in the User Content Licence.')).toBe(true);
      expect(inVoice('See the Patient Charter for details.')).toBe(true);
    });

    it('still catches the lowercase form the proper-noun exception must not hide', () => {
      // The exception was written /…\b(?!\s+[A-Z])/i at first. With the i flag
      // [A-Z] matches lowercase too, so it swallowed every case and the rule
      // silently stopped working.
      expect(inVoice('The user should consult a professional.')).toBe(false);
      expect(inVoice('the user can add a report later.')).toBe(false);
    });
  });

  describe('warmth may change how something is said, never what', () => {
    // This is the rule that matters most. A friendly sentence that quietly
    // makes a clinical claim is worse than a cold one that does not.
    it.each([
      'There is nothing to worry about here.',
      "Don't worry — this is easily fixed.",
      "You're completely fine.",
      'This is perfectly normal.',
      'No reason to be concerned.',
    ])('rejects %s', (t) => expect(inVoice(t)).toBe(false));

    it('accepts an honest, kind sentence about the same result', () => {
      const kind = 'Seeing a number below the reference range is unsettling, and this one is '
        + 'mild — your haemoglobin is 11.7 against a floor of 12. It is the kind of gap that '
        + 'iron and a follow-up test usually close.';
      expect(violations(kind)).toEqual([]);
    });
  });

  describe('no machine filler', () => {
    it.each([
      'It is important to note that ferritin reflects stored iron.',
      'Please note that this is not a diagnosis.',
      'In conclusion, your markers are mixed.',
      'Based on the data provided, your B12 is low.',
    ])('rejects %s', (t) => expect(inVoice(t)).toBe(false));
  });

  describe('violations explain themselves', () => {
    it('names the phrase and why it is wrong', () => {
      const v = violations('As an AI, I would recommend nothing to worry about.');
      expect(v.length).toBeGreaterThan(1);
      for (const x of v) {
        expect(x.phrase.length).toBeGreaterThan(0);
        expect(x.why.length).toBeGreaterThan(8);
      }
    });
  });

  describe('acceptOrFallback', () => {
    const fallback = 'Your vitamin B12 is 148 pg/mL, below the 200 reference floor.';

    it('keeps prose that is long enough and in voice', () => {
      const good = 'Your vitamin B12 came back at 148, under the 200 floor. Low B12 can show up '
        + 'as tiredness or brain fog, so it is worth acting on rather than filing away.';
      expect(acceptOrFallback(good, fallback)).toBe(good);
    });

    it('drops prose that breaks the voice, however fluent', () => {
      const bad = "Don't worry about your B12 at all — as an AI I can tell you this is perfectly "
        + 'normal and there is nothing to worry about whatsoever in these results.';
      expect(acceptOrFallback(bad, fallback)).toBe(fallback);
    });

    it('drops a stub', () => {
      expect(acceptOrFallback('Low B12.', fallback)).toBe(fallback);
      expect(acceptOrFallback(undefined, fallback)).toBe(fallback);
    });
  });

  describe('cityVoice', () => {
    it('names the person and opens with the salutation', () => {
      const p = cityVoice('Somen Kumar');
      expect(p).toContain('Somen');
      expect(p).toContain('Dear Somen,');
    });

    it('still works with no name on file', () => {
      expect(cityVoice(null)).toContain('Dear user,');
    });

    it('states the honesty constraint, not just the warmth one', () => {
      // A prompt that asks only for warmth gets "I'm here to help you on your
      // wellness journey!" — warm about itself, and reassuring about nothing.
      const p = cityVoice('Somen');
      expect(p).toMatch(/never say there is nothing to worry about/i);
      expect(p).toMatch(/never refer to yourself/i);
    });
  });
});
