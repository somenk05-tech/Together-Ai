import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A screen that knows it is waiting must know it can be refused.
 *
 * This guard exists because of the dashboard. It read six queries, handled
 * `isLoading`, and had no failure branch anywhere in 191 lines — so a profile
 * request that failed produced a greeting addressed to nobody ("Welcome,", with
 * the orphan comma), silently deleted the completion meter its own header calls
 * "the one thing that is always true and always actionable", and then told the
 * citizen — warmly, at length, in the section commented "the honest empty state"
 * — that their city was quiet because they hadn't put anything in it yet.
 *
 * NONE OF THAT WAS A MISSING ERROR MESSAGE. It was the page answering questions
 * it had no answer to. `data` is undefined in exactly two situations that mean
 * opposite things — you have nothing, and we don't know — and every `?? []`,
 * `?? 0` and `.length === 0` in a component collapses them into the first one.
 * The golden rule says no screen invents data; a screen that reports an absence
 * it never established is breaking the same rule with the sign flipped, and it
 * is harder to see because empty states are supposed to look like that.
 *
 * THE TEST: a file that reads `.data` off a query and branches on `.isLoading`
 * has demonstrated it knows a request is in flight. Such a file must mention
 * `isError` or `isSuccess` in its CODE — comments are stripped first, because
 * the first draft of this guard could be satisfied by a comment saying the file
 * did not handle errors. That is a low bar on purpose: it cannot check that the
 * branch is correct or that the copy is honest, only that the question was asked
 * at all. It is a ratchet, not a proof.
 *
 * The list below is what the codebase looked like when the dashboard was fixed:
 * thirty-five screens that handle waiting and not refusal. It is allowed to get
 * shorter and nothing else. Do not add to it — a new screen with no failure
 * state is this bug again, and every entry here is a page that can currently
 * tell somebody a comfortable thing that isn't true.
 */
const KNOWN_MISSING = [
  'components/SearchSelect.tsx',
  'features/astrology/pages/AstroAsk.tsx',
  'features/astrology/pages/AstroProfilePage.tsx',
  'features/astrology/pages/AstroRemedies.tsx',
  'features/beauty/pages/Routine.tsx',
  'features/chat/components/ChatStarter.tsx',
  'features/chat/share.tsx',
  'features/dating/pages/DatingProfile.tsx',
  'features/entertainment/pages/Curated.tsx',
  'features/entertainment/pages/Movies.tsx',
  'features/entertainment/pages/Ott.tsx',
  'features/entertainment/pages/Watchlist.tsx',
  'features/family/components/FamilyDashboard.tsx',
  'features/family/components/FamilyPortions.tsx',
  'features/family/pages/Connect.tsx',
  'features/family/pages/Search.tsx',
  'features/mail/DrivePicker.tsx',
  'features/nutrition/components/GroceryPlanner.tsx',
  'features/nutrition/components/QuickCommerce.tsx',
  'features/nutrition/pages/Blood.tsx',
  'features/nutrition/pages/Onboarding.tsx',
  'features/nutrition/pages/Preferences.tsx',
  'features/restaurants/pages/Decide.tsx',
  'features/restaurants/pages/Explore.tsx',
  'features/social/PostCard.tsx',
  'features/social/ReelsView.tsx',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.(test|spec)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * COMMENTS ARE NOT CODE, AND THIS GUARD LEARNED THAT ABOUT ITSELF.
 *
 * The first version scanned raw file text, so a file passed if the string
 * "isError" appeared anywhere in it — including in a comment explaining that it
 * did not handle isError. Dashboard.tsx satisfied its own guard on the strength
 * of a sentence in a block comment, and the harness below, which restores the
 * bug and demands the guard notice, is what caught it.
 *
 * The regex is deliberately crude: block comments, then line comments, with the
 * `[^:]` guard so it does not eat the `//` in a URL. It only has to be good
 * enough to stop prose being mistaken for behaviour.
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const missingFailureState = (): string[] =>
  walk(src)
    .filter((p) => {
      const s = stripComments(readFileSync(p, 'utf8'));
      return /\.isLoading/.test(s) && /\.data/.test(s) && !/isError|isSuccess/.test(s);
    })
    .map((p) => relative(src, p).split('\\').join('/'))
    .sort();

describe('screens that can be refused', () => {
  it('does not grow: no new screen handles loading without handling failure', () => {
    const added = missingFailureState().filter((p) => !KNOWN_MISSING.includes(p));

    expect(added, [
      '',
      'These screens read query data and branch on .isLoading, but never ask',
      'whether the request failed. When it does, `data` is undefined and every',
      '`?? []` and `.length === 0` below reports it as "you have nothing" —',
      'which is a claim about the citizen\'s own records that was never checked.',
      '',
      'Handle isError, then this passes. Do not add the file to KNOWN_MISSING.',
      '',
    ].join('\n')).toEqual([]);
  });

  it('the list is a ratchet: fixed screens must be removed from it', () => {
    const current = missingFailureState();
    const stale = KNOWN_MISSING.filter((p) => !current.includes(p));

    expect(stale, [
      '',
      'These are listed as missing a failure state but no longer are — someone',
      'fixed them. Delete them from KNOWN_MISSING so the list keeps meaning what',
      'it says. A stale allowance is a hole waiting for the next regression.',
      '',
    ].join('\n')).toEqual([]);
  });

  it('the dashboard is not on the list, and cannot go back on it', () => {
    // The screen this guard was written for. Named explicitly so that removing
    // its failure branch fails here with the reason rather than as a count.
    expect(missingFailureState()).not.toContain('pages/Dashboard.tsx');
  });
});
