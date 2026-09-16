import { isReleaseKey, releaseLabel } from './release';

/**
 * ── WHAT A CHANGE TOUCHES, IN WORDS (owner, 16 Sep) ─────────────────────────
 *
 * "Give options of what things will go live." A commit title says what was
 * meant; the files say where it lands. This turns a commit's file list into a
 * few plain names the owner recognises — a hub, a page, "the whole site's
 * look", "a database change" — so the Go live list can be read without git.
 *
 * Pure: the same files always give the same words, in first-seen order.
 */
const WEB = 'together-city-react/';
const API = 'together-city-chat/';
const SHARED_WEB = new Set(['layouts', 'components', 'styles', 'app', 'hooks', 'lib', 'store', 'api', 'services', 'utils', 'theme']);
const TOOLS = 'Tools and notes (not on the site)';

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ');

function hub(dir: string): string {
  if (isReleaseKey(dir)) return releaseLabel(dir);
  if (dir === 'dev') return 'Developer page';
  return title(dir);
}

export function areaOf(path: string): string {
  if (path.startsWith(WEB)) {
    const rest = path.slice(WEB.length).split('/');
    if (rest[0] === 'public') return 'Images and media';
    if (rest[0] === 'scripts') return TOOLS;
    if (rest[0] !== 'src') return 'Website settings';
    if (rest[1] === 'features' && rest[2]) return hub(rest[2]);
    if (rest[1] === 'pages' && rest[2]) {
      const page = rest[2].replace(/\.[a-z]+$/i, '');
      return page.toLowerCase() === 'personalize' ? releaseLabel('personalize') : `Page: ${page}`;
    }
    if (SHARED_WEB.has(rest[1] ?? '')) return 'Whole site: look and shared parts';
    return 'Website';
  }
  if (path.startsWith(API)) {
    const rest = path.slice(API.length).split('/');
    if (rest[0] === 'prisma') return 'Database change';
    if (rest[0] === 'scripts' || rest[0] === 'docs') return TOOLS;
    if (rest[0] !== 'src') return 'Server settings';
    if (!rest[2]) return 'Server: start-up';
    const mod = rest[1];
    if (mod === 'release' || mod === 'dev') return 'Go live and developer tools';
    if (isReleaseKey(mod)) return `${releaseLabel(mod)} (server)`;
    return `Server: ${mod.replace(/-/g, ' ')}`;
  }
  if (path.startsWith('together-city-mobile/')) return 'Phone app';
  if (path.startsWith('workers/')) return 'Background workers';
  return TOOLS;
}

/** The distinct areas, first-seen, at most `max` (the rest counted). */
export function areasOf(paths: readonly string[], max = 6): string[] {
  const seen: string[] = [];
  for (const p of paths) {
    const a = areaOf(p);
    if (!seen.includes(a)) seen.push(a);
  }
  // Database changes are the ones to notice first.
  seen.sort((a, b) => Number(b === 'Database change') - Number(a === 'Database change'));
  return seen.length > max ? [...seen.slice(0, max), `and ${seen.length - max} more`] : seen;
}

/** The message without its title and without trailer lines. */
export function commitDetails(message: string, max = 420): string {
  const body = message.split('\n').slice(1)
    .filter((l) => !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(l.trim()))
    .join('\n').trim();
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body;
}

/** "(cherry picked from commit <sha>)" lines: changes already sent on their own. */
export function pickedFrom(message: string): string[] {
  return [...message.matchAll(/\(cherry picked from commit ([0-9a-f]{40})\)/g)].map((m) => m[1]);
}

export const RELEASE_BOT_TITLE = 'release: the live site shows';

/** Where a GitHub deployment went, in words. */
export function deployLabel(environment: string): string {
  if (environment === 'Production') return 'Website (Vercel)';
  if (/\/ production$/.test(environment)) return `Server (Railway: ${environment.split(' /')[0]})`;
  return environment;
}

/** The deployments that are the live site's: not previews, not the developer copy. */
export const isLiveEnvironment = (environment: string): boolean =>
  !/preview|development|staging/i.test(environment);
