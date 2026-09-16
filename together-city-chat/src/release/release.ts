import { visibilityFlag } from '../dev/feature-flags';
import { LIVE_HUBS } from './live-hubs';

/**
 * ── TWO CITIES FROM ONE CODEBASE (owner, 16 Sep) ────────────────────────────
 *
 * "Create a copy of the entire website for the developer where I continue to
 * work, while a leaner version of the website is launched. Anything I work on
 * stays on the developer site until I press the Go live button."
 *
 * Two branches, two deployments, two databases:
 *
 *   develop → dev.togethercity.app + dev-api.togethercity.app  (RELEASE_CHANNEL=dev)
 *   main    → togethercity.app     + api.togethercity.app      (RELEASE_CHANNEL=live)
 *
 * Code reaches `main` only through the Go live button (release.service.ts →
 * .github/workflows/go-live.yml). This file is the OTHER half of "lean": which
 * finished hubs the live site shows. The developer site shows every hub.
 *
 * WHAT A HELD HUB IS ON THE LIVE SITE. Its doors go (header, drawer, home,
 * grid, Search the city, Personalize's pills) and its address answers with an
 * "opening soon" card. Its API is NOT refused: the Digital Store is a
 * shopfront over the Beauty, Nutrition, Astrology and Pet endpoints, so
 * closing those would break a hub that is live. Holding is a front-of-house
 * decision; the kill switches on /dev remain the way to refuse an API.
 */

export type ReleaseChannel = 'live' | 'dev';

/**
 * Which city this deployment is.
 *
 * UNSET IN PRODUCTION MEANS LIVE, deliberately. The two ways to get this wrong
 * are not equal: a developer site that forgot the variable looks lean (you
 * notice at once, nothing leaks), while a live site that forgot it would show
 * every unfinished hub to the public. So the forgetful default is the lean one.
 * Outside production (a laptop, CI, the test suites) it is the developer city.
 */
export function releaseChannel(env: NodeJS.ProcessEnv = process.env): ReleaseChannel {
  const v = (env.RELEASE_CHANNEL ?? '').trim().toLowerCase();
  if (v === 'dev') return 'dev';
  if (v === 'live') return 'live';
  return (env.NODE_ENV ?? 'development') === 'production' ? 'live' : 'dev';
}

export interface ReleaseHub {
  /** The district's visibility key — the same key as its /dev door switch. */
  key: string;
  /** The web addresses the district owns, held behind "opening soon". */
  paths: string[];
}

/**
 * THE DISTRICTS THE BUTTON CAN HOLD BACK. A fixed list, like every switch list.
 *
 * Mail, Chat, Personal and Mira are NOT here: they are the citizen's own doors
 * (their inbox, their conversations, their notes, their assistant), not
 * districts being launched, and every hub that is live leans on them.
 */
export const RELEASE_HUBS: readonly ReleaseHub[] = [
  { key: 'personalize', paths: ['/personalize'] },
  { key: 'ecommerce', paths: ['/ecommerce'] },
  { key: 'services', paths: ['/services'] },
  { key: 'social', paths: ['/social'] },
  { key: 'astrology', paths: ['/astrology', '/profile/astrology'] },
  { key: 'babycare', paths: ['/babycare'] },
  { key: 'beauty', paths: ['/beauty'] },
  { key: 'dating', paths: ['/matchmaking', '/dating'] },
  { key: 'entertainment', paths: ['/entertainment'] },
  { key: 'family', paths: ['/family'] },
  { key: 'financial', paths: ['/financial'] },
  { key: 'fitness', paths: ['/fitness'] },
  { key: 'jobs', paths: ['/jobs'] },
  { key: 'medical', paths: ['/medical'] },
  { key: 'nutrition', paths: ['/nutrition'] },
  { key: 'pets', paths: ['/pets'] },
  { key: 'realestate', paths: ['/realestate'] },
  { key: 'travel', paths: ['/travel'] },
];

export const RELEASE_KEYS: readonly string[] = RELEASE_HUBS.map((h) => h.key);
export const isReleaseKey = (k: string): boolean => RELEASE_KEYS.includes(k);
export const releaseLabel = (k: string): string => visibilityFlag(k)?.label ?? k;

/** The districts this deployment holds back. Always none on the developer city. */
export function heldHubs(channel: ReleaseChannel, live: readonly string[] = LIVE_HUBS): string[] {
  if (channel === 'dev') return [];
  return RELEASE_KEYS.filter((k) => !live.includes(k));
}

/** The addresses those districts own. */
export function heldPaths(keys: readonly string[]): string[] {
  return RELEASE_HUBS.filter((h) => keys.includes(h.key)).flatMap((h) => h.paths);
}

/** Segment-aware: '/beauty' covers '/beauty/market', never '/beautyful'. */
export function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The button's own input, cleaned: known keys only, each once, in list order.
 * Unknown keys are refused by the caller rather than dropped silently here —
 * a typo on a release is worth a sentence, not a quiet omission.
 */
export function normaliseLiveHubs(keys: readonly string[]): string[] {
  const want = new Set(keys);
  return RELEASE_KEYS.filter((k) => want.has(k));
}

/** Where the release runs. The button dispatches the workflow that lives on
 *  `main`, so a commit on `develop` can never rewrite how it is released. */
export const RELEASE_REPO = 'somenk05-tech/Together-Ai';
export const RELEASE_WORKFLOW = 'go-live.yml';
export const RELEASE_RUNS_URL = `https://github.com/${RELEASE_REPO}/actions/workflows/${RELEASE_WORKFLOW}`;
