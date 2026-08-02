import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const profile = readFileSync(join(web, 'features', 'social', 'pages', 'Profile.tsx'), 'utf8');
/** The comments here name the call this replaced, so absence checks read the
 *  code only — a guard that reads its own documentation never goes green. */
const code = profile
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

/**
 * B.9 — PublicProfileModal, finished and imported by nobody, now wired.
 *
 * It was exported for a parent that did not exist. The home is the followers /
 * following list, which is exactly the place a peek beats a departure: the
 * modal already carries Follow, Connect and the safety actions, and tapping a
 * row should not cost you your place in a list you are browsing.
 *
 * THE TRAP, AND IT IS THE WHOLE REASON THIS FILE EXISTS. FollowList used to
 * navigate to /social/u/<handle>. The modal's footer was Safety / Close /
 * Connect — no way through to the full profile. Swapping one for the other
 * without adding that link would have removed the only route from a followers
 * list to somebody's posts, and it would have looked like a clean wire-up in
 * the diff: a dead export becomes live, a ceiling drops, a page loses a door.
 */
describe('the followers list', () => {
  it('peeks with the modal instead of leaving the page', () => {
    expect(code).toMatch(/onView=\{\(\) => setPeek\(person\.handle\)\}/);
    expect(code).toMatch(/\{peek && <PublicProfileModal handle=\{peek\} onClose=/);
    // The departure it replaced, spelled out so it cannot come back unnoticed.
    expect(code).not.toMatch(/onView=\{\(\) => navigate\(`\/social\/u\//);
  });

  it('keeps the door it replaced — the modal links to the full profile', () => {
    expect(code).toMatch(/View full profile/);
    expect(code).toMatch(/<Link to=\{`\/social\/u\/\$\{encodeURIComponent\(p\.handle\)\}`\}/);
    // And closes on the way through, so the peek is not left hanging over the
    // page it sent you to.
    expect(code).toMatch(/View full profile[\s\S]{0,40}/);
    expect(code).toMatch(/<Link to=\{`\/social\/u\/\$\{encodeURIComponent\(p\.handle\)\}`\} onClick=\{onClose\}/);
  });

  it('still offers the actions that made a peek worth having', () => {
    for (const action of ['<SafetyActions', '<ConnectButton', 'Close']) {
      expect(code).toContain(action);
    }
  });
});
