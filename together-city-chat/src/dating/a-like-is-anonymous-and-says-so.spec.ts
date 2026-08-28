/**
 * ── THE CARD AND THE PUSH TELL THE SAME STORY ──
 *
 * The card under the ♡ said "They're notified only if you both choose each
 * other". A like sends "You have a new like 💛" to that person immediately. The
 * notification names nobody — which is the part worth keeping and the part that
 * was true — but the sentence claimed no notification at all, at the moment of
 * the decision, about what a stranger would learn.
 *
 * Owner's call (28 Aug): the anonymous alert stays and the copy tells the
 * truth. Which makes these two sentences one promise held in two packages —
 * the card that takes the tap, and the push that lands on a phone — and a
 * promise split across two files is one somebody edits half of.
 *
 * The second half is where the push POINTS. Its body said "see who in your
 * matches", and there is no likes-received surface in this API: Curated Matches
 * renders mutual matches only, so it sent somebody to a page that would answer
 * "Nobody has matched you back yet". Both notifications go to Browse now,
 * because liking back is the action the words describe.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comments stripped: this file is about what the app SAYS, and the prose
 * explaining a fix quotes the wording it removed.
 *
 * WHOLE-LINE comments only. A `//` in the middle of a line is as likely to be
 * `togethercity://dating/browse` as a remark — which is exactly what the first
 * draft of this helper ate, quietly, leaving the assertion below to fail on a
 * deep link that was correct in the source.
 */
const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');

const SERVICE = stripComments(fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8'));
const CARD = stripComments(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'dating', 'components', 'MatchCards.tsx'), 'utf8',
));
const DETAIL = stripComments(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'dating', 'pages', 'DatingMatchDetail.tsx'), 'utf8',
));

/** The `notifications.create({...})` call that a like sends. */
const likeCall = (() => {
  // lastIndexOf, not indexOf: the phrase appears first in the comment above
  // the call, explaining the re-tap fix. The title is the later one.
  const at = SERVICE.lastIndexOf('You have a new like');
  if (at < 0) throw new Error('the like notification moved — find it and re-point this test');
  // Back to the start of the create call, forward past the href.
  const from = SERVICE.lastIndexOf('notifications.create({', at);
  return SERVICE.slice(from, SERVICE.indexOf('});', at) + 3);
})();

describe('what the card promises', () => {
  it('no longer says a like is unseen — because it is not', () => {
    expect(CARD).not.toMatch(/notified only if you both choose each other/);
    expect(DETAIL).not.toMatch(/notified only if you both choose each other/);
  });

  it('says the thing that IS true, on both surfaces: told, never told who', () => {
    expect(CARD).toMatch(/never who/);
    expect(DETAIL).toMatch(/never who/);
  });
});

describe('what the push says', () => {
  it('does not send anybody to look for a face this product will not show them', () => {
    expect(likeCall).not.toMatch(/see who/i);
  });

  it('points at the deck, where liking back is possible, not at mutual matches', () => {
    expect(likeCall).toMatch(/href: '\/dating\/browse'/);
    expect(likeCall).toMatch(/deepLink: 'togethercity:\/\/dating\/browse'/);
  });

  it('still names nobody — the anonymity is the product, not an accident', () => {
    expect(likeCall).not.toMatch(/shownName|firstName|\.name\b/);
  });

  it('and the high-score alert points there too, for the same reason', () => {
    const at = SERVICE.indexOf('You have a new ${score}% compatible match');
    expect(at).toBeGreaterThan(0);
    expect(SERVICE.slice(at, at + 700)).toMatch(/href: '\/dating\/browse'/);
  });
});
