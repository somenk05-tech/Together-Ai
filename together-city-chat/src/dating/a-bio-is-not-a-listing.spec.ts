import * as fs from 'fs';
import * as path from 'path';
import { scanBio, phoneLike } from './bio-scan';

/**
 * ── A BIO IS NOT A LISTING ──
 *
 * A dating bio was screened by the word list written for property adverts, and
 * both of the checks it fed were `hard`, which in `decide()` means REJECTED —
 * and a rejected profile 403s out of Browse, Curated Matches, liking and
 * reaching. So the cost of a false positive here is the whole hub.
 *
 * The MUST-PASS list below is the finding. Every one of these is a sentence a
 * real person writes on a dating profile, and every one of them was a rejection
 * on 28 Aug. They are the reason this file exists and the reason it is long:
 * the next person to tighten a pattern needs to fail against these, not against
 * their own idea of what a bio looks like.
 *
 * The MUST-CATCH list is the other half. A list that rejects nothing is not
 * safer than one that rejects everything; it is the same failure pointed the
 * other way, and this hub's one product rule about bios is that the
 * conversation stays on Together City.
 */

const MUST_PASS = [
  // \bsex\b — and the two most common ways it appears honestly.
  'Not looking for casual sex, just something real.',
  'Attracted to the same sex.',
  // \bweed\b, \bnude\b, \bgun\b — words, not intentions.
  'I love the outdoors, hiking, and I don’t smoke weed.',
  'Ask me about my nude watercolours.',
  'Sober since 2019. No drugs, no drink, still fun.',
  // The digit run that was read as a phone number.
  'Lived in Mumbai 2010 - 2015, Delhi 2015 - 2020, Pune since.',
  'Yoga at 6 30 - 7 30 every morning, coffee after.',
  'Marathon runner. PRs: 5k 21 30, 10k 44 12, HM 1 38 05.',
  'Born 15 08 1995. Moved to Bangalore 20 05 2012.',
  'I read about 30 books a year, run 10 km three times a week.',
  // /w\.?a\.?/ read two initials as a WhatsApp handle.
  'I work in Washington DC. W.A. is where I grew up.',
  // An app named, with nothing handed over.
  'Instant noodles are a food group. Instagram-free since 2019.',
  // Words that only look like the list they were on.
  'Grammar nazi, sorry in advance.',
  'My cat is called Isis and she runs the house.',
  'Escorted my grandmother down the aisle last spring.',
  'Teacher. I work with 16 to 18 year olds every day.',
];

const MUST_CATCH: Array<[string, string]> = [
  ['a phone number', 'Hit me on whatsapp 98765 43210'],
  ['a phone number', 'Call 555 123 4567 anytime'],
  ['an email address', 'reach me at rahul@gmail.com'],
  ['a link', 'www.myportfolio.in for pics'],
  ['a link', 't.me/rahul91'],
  ['a payment id', 'pay me at rahul@ybl'],
  ['a social handle', '@rahul_sharma on all apps'],
  ['a messaging or social handle', 'insta: rahul.sharma91'],
  ['a messaging or social handle', 'snapchat: rahul'],
  ['a messaging or social handle', 'add me on telegram'],
];

describe('the bios that must survive', () => {
  for (const bio of MUST_PASS) {
    it(`lets through: ${bio}`, () => {
      const s = scanBio(bio);
      expect(s.contacts).toEqual([]);
      expect(s.prohibited).toBeNull();
      expect(s.scam).toBe(false);
    });
  }
});

describe('the hand-offs that must not', () => {
  for (const [label, bio] of MUST_CATCH) {
    it(`catches ${label} in: ${bio}`, () => {
      expect(scanBio(bio).contacts).toContain(label);
    });
  }
});

describe('a phone number is counted, not matched', () => {
  it('takes ten to fifteen digits in one unbroken run', () => {
    expect(phoneLike('+91 98765 43210')).toBe(true);
    expect(phoneLike('9876543210')).toBe(true);
    expect(phoneLike('(555) 123-4567')).toBe(true);
  });

  it('does not take a pair of years, because a comma ends the run', () => {
    expect(phoneLike('2010 - 2015, 2015 - 2020')).toBe(false);
    expect(phoneLike('1995')).toBe(false);
  });

  it('does not take a run longer than any phone number', () => {
    expect(phoneLike('1234567890123456789')).toBe(false);
  });
});

describe('prohibited is a phrase, never a word', () => {
  it('rejects an offer of paid services', () => {
    expect(scanBio('Escort service available, rate card on request.').prohibited)
      .toBe('an offer of paid or commercial services');
  });

  it('rejects a reference to minors', () => {
    expect(scanBio('under 18 only').prohibited).toBe('a reference to minors');
  });

  /**
   * The one that matters most, said as plainly as it can be: no single word is
   * grounds for closing somebody out of the hub. If a bare word is ever added
   * to PROHIBITED, this fails.
   */
  it('holds nothing that a one-word match can trip', () => {
    for (const word of ['sex', 'nude', 'weed', 'gun', 'porn', 'escort', 'nazi', 'isis', 'teen']) {
      expect(scanBio(`I mentioned ${word} once.`).prohibited).toBeNull();
    }
  });
});

describe('romance-scam phrasing is a look, not a verdict', () => {
  it('reads what a romance scam says rather than what a fake listing says', () => {
    expect(scanBio('Send me a gift card first and I’ll share more.').scam).toBe(true);
    expect(scanBio('Bitcoin trader, let me double your money.').scam).toBe(true);
    expect(scanBio('I like long walks and short queues.').scam).toBe(false);
  });
});

describe('the wiring', () => {
  /**
   * Comments stripped, same helper and same reason as
   * `a-like-is-anonymous-and-says-so.spec.ts`: the prose explaining a fix
   * quotes the name it removed, and an assertion that reads the explanation
   * instead of the code passes for the wrong reason — or, here, fails for one.
   */
  const strip = (src: string) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
  const SERVICE = strip(fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8'));
  const MODERATION = strip(fs.readFileSync(path.join(__dirname, '..', 'realestate', 'moderation.ts'), 'utf8'));

  it('no longer asks the property pipeline what a bio says', () => {
    expect(SERVICE).not.toMatch(/\bscanText\b/);
    expect(SERVICE).toMatch(/scanBio\(bio\)/);
  });

  /**
   * And the property list did not stay behind as a second, wrong answer to the
   * same question — an export with no caller is the next person's shortcut.
   */
  it('leaves no unowned copy of the old scanner', () => {
    expect(MODERATION).not.toMatch(/export function scanText/);
  });

  it('keeps the route back: contact is hard, and it names what to remove', () => {
    expect(SERVICE).toMatch(/Remove \$\{scan\.contacts\.join\(', '\)\} from your bio/);
    expect(SERVICE).toMatch(/you can save again straight away/);
  });
});
