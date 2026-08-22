import type { HubKey } from '@/types';
import { HUBS, NAV, type TabKey } from '@/config/hubs';
import type { IconName } from '@/components/ui/Icon';

export type DestKind = 'hub' | 'page' | 'account' | 'action';

export interface Dest {
  id: string;
  kind: DestKind;
  label: string;
  sub?: string;
  path: string;
  hub?: HubKey | 'account';
  /** Extra search terms so intent-style queries ("book a doctor") still land. */
  keywords?: string;
  icon?: IconName;
}

/** Hub → a representative icon for the palette / crumbs. */
/** Exported because the hub landing plates draw the same glyph. One map, so a
 *  hub cannot be a heart in the command palette and a star on its own page. */
export const HUB_ICON: Partial<Record<HubKey, IconName>> = {
  travel: 'trip', astrology: 'sparkles', nutrition: 'recipe', entertainment: 'movie',
  social: 'people', dating: 'heart', realestate: 'property', jobs: 'job', medical: 'heart',
  financial: 'product', beauty: 'sparkles', fitness: 'star', mail: 'mail', family: 'people',
  services: 'connection', pets: 'paw', ecommerce: 'product',
};

/**
 * THE GLYPH A TAB WEARS.
 *
 * Every hub has one in HUB_ICON above. Personal is a TAB and not a hub, so it
 * answers here — in one function, so the drawer, the all-hubs grid and the
 * command palette cannot end up drawing it three different ways. `place` is
 * the fallback for a hub that has not been given a glyph; Personal is
 * explicitly not a place, which is the whole reason it needs this line.
 */
export function tabIcon(key: TabKey): IconName {
  return key === 'personal' ? 'personal' : (HUB_ICON[key] ?? 'place');
}

/** Top-level account / global destinations that aren't hubs. */
const ACCOUNT: Dest[] = [
  { id: 'home', kind: 'account', label: 'City Home', path: '/', hub: 'account', icon: 'place', keywords: 'dashboard start' },
  { id: 'profile', kind: 'account', label: 'My Profile', path: '/profile', hub: 'account', icon: 'user', keywords: 'account me' },
  { id: 'settings', kind: 'account', label: 'Settings', path: '/settings', hub: 'account', icon: 'user', keywords: 'preferences account privacy password' },
  { id: 'privacy', kind: 'account', label: 'Privacy & Permissions', path: '/settings/privacy', hub: 'account', icon: 'bell', keywords: 'consent data permissions opt-in' },
  { id: 'calendar', kind: 'account', label: 'Calendar', path: '/calendar', hub: 'account', icon: 'calendar', keywords: 'schedule events' },
  { id: 'chats', kind: 'account', label: 'Chats', path: '/chats', hub: 'account', icon: 'chat', keywords: 'messages dm' },
  { id: 'connections', kind: 'account', label: 'Other citizens', path: '/connections', hub: 'account', icon: 'connection', keywords: 'friends family requests network' },
  { id: 'notifications', kind: 'account', label: 'Notifications', path: '/social/notifications', hub: 'account', icon: 'bell', keywords: 'alerts' },
];

/** Natural-language "do" commands → the page that starts the task (audit 3.1). */
const ACTIONS: Dest[] = [
  { id: 'a-meals', kind: 'action', label: 'Plan my meals', path: '/nutrition/weekly', hub: 'nutrition', icon: 'recipe', keywords: 'meal plan weekly food diet planner' },
  { id: 'a-groceries', kind: 'action', label: 'Order groceries', path: '/nutrition/grocery', hub: 'nutrition', icon: 'product', keywords: 'grocery shop cart food' },
  { id: 'a-doctor', kind: 'action', label: 'Book a doctor', path: '/medical/consults', hub: 'medical', icon: 'heart', keywords: 'consult appointment gp physician health' },
  { id: 'a-blood', kind: 'action', label: 'View my latest blood test', path: '/medical/blood', hub: 'medical', icon: 'heart', keywords: 'labs biomarkers results panel' },
  { id: 'a-tests', kind: 'action', label: 'Order blood tests', path: '/medical/tests', hub: 'medical', icon: 'heart', keywords: 'lab diagnostics home collection' },
  { id: 'a-trips', kind: 'action', label: 'Show my upcoming trips', path: '/travel/trips', hub: 'travel', icon: 'trip', keywords: 'travel bookings flights holiday' },
  { id: 'a-flight', kind: 'action', label: 'Book a flight', path: '/travel/flights', hub: 'travel', icon: 'flight', keywords: 'travel airfare' },
  { id: 'a-workout', kind: 'action', label: "Start today's workout", path: '/fitness/workout', hub: 'fitness', icon: 'star', keywords: 'exercise gym training' },
  { id: 'a-wallet', kind: 'action', label: 'Open my wallet', path: '/financial/wallet', hub: 'financial', icon: 'product', keywords: 'money balance pay finance' },
  { id: 'a-spend', kind: 'action', label: 'See my spending', path: '/financial/spending', hub: 'financial', icon: 'product', keywords: 'budget money transactions finance' },
  { id: 'a-matches', kind: 'action', label: 'See my matches', path: '/dating/matches', hub: 'dating', icon: 'heart', keywords: 'dating date love' },
  { id: 'a-horoscope', kind: 'action', label: "Read today's horoscope", path: '/astrology/today', hub: 'astrology', icon: 'sparkles', keywords: 'astrology guidance stars zodiac' },
  { id: 'a-post', kind: 'action', label: 'Create a post', path: '/social/create', hub: 'social', icon: 'people', keywords: 'share photo video social' },
  { id: 'a-movies', kind: 'action', label: "What's on this week", path: '/entertainment/movies', hub: 'entertainment', icon: 'movie', keywords: 'movies cinema tickets' },
];

/** Build every hub + every inner page into a flat, searchable catalog. */
function buildDestinations(): Dest[] {
  const out: Dest[] = [...ACCOUNT];

  for (const nav of NAV) {
    // Personal is a TAB, not a hub: it has no HUBS entry and no hub art. Both
    // maps are Partial, so reading them with its key is an undefined rather
    // than a crash, and the fallbacks below are what it renders with.
    const cfg = HUBS[nav.key as HubKey];
    out.push({
      id: `hub-${nav.key}`, kind: 'hub', label: cfg?.name ?? nav.label, sub: cfg?.tag,
      path: nav.path, hub: nav.key as HubKey, icon: tabIcon(nav.key), keywords: nav.label.toLowerCase(),
    });
  }
  // Family Nutrition isn't a header tab but is a real hub.
  out.push({ id: 'hub-family', kind: 'hub', label: HUBS.family.name, sub: HUBS.family.tag, path: '/family', hub: 'family', icon: 'people', keywords: 'family household shared meals' });
  /* TRAVEL LEFT THE HEADER, NOT THE CITY (owner, 15 Aug). It is out of NAV, so
     the loop above no longer lists it — and a hub nobody can find is a hub
     nobody can use. Listed here for exactly the reason Family is: a real hub
     that is not a header tab. Its ROOMS still arrive below, which walks HUBS
     rather than NAV. */
  out.push({ id: 'hub-travel', kind: 'hub', label: HUBS.travel.name, sub: HUBS.travel.tag, path: '/travel', hub: 'travel', icon: 'trip', keywords: 'travel trips flights hotels holiday' });
  /* The Personal rooms, which have no hub to be walked out of. Three of them
     existed and were listed nowhere; the palette is where somebody who
     half-remembers "album" finds it. */
  out.push(
    { id: 'p-personal-thoughts', kind: 'page', label: 'Thoughts', sub: 'Your private journal', path: '/thoughts', keywords: 'personal journal diary notes write' },
    { id: 'p-personal-calendar', kind: 'page', label: 'Calendar', sub: 'Everything you have coming', path: '/calendar', icon: 'calendar', keywords: 'personal schedule events dates' },
    { id: 'p-personal-drive', kind: 'page', label: 'Drive', sub: 'Your documents', path: '/drive', keywords: 'personal files documents storage upload' },
    { id: 'p-personal-album', kind: 'page', label: 'Album', sub: 'Every photo and video you have posted', path: '/personal/album', keywords: 'personal photos videos gallery pictures memories' },
  );

  for (const key of Object.keys(HUBS) as HubKey[]) {
    const cfg = HUBS[key];
    for (const it of cfg.items) {
      out.push({
        id: `p-${it.path}`, kind: 'page', label: it.label, sub: it.sub, path: it.path,
        hub: key, icon: HUB_ICON[key], keywords: `${cfg.name} ${it.sub}`.toLowerCase(),
      });
    }
  }

  out.push(...ACTIONS);
  // De-dupe by path, keeping the first (account > hub > page > action ordering above).
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

export const DESTINATIONS: Dest[] = buildDestinations();

/** Map a hub key to its display name + landing path (for crumbs). */
export function hubMeta(hub: HubKey): { name: string; path: string } {
  const cfg = HUBS[hub];
  return { name: cfg?.name ?? hub, path: cfg?.backPath ?? `/${hub}` };
}

const TITLE_OVERRIDE: Record<string, string> = {
  '/': 'City Home', '/profile': 'My Profile', '/settings': 'Settings',
  '/settings/privacy': 'Privacy & Permissions', '/calendar': 'Calendar', '/chats': 'Chats',
  '/connections': 'Other citizens',
};

/**
 * A DATABASE KEY IS NOT A PAGE TITLE.
 *
 * The fallback below title-cases the last segment of the path, which is right
 * for /mail/inbox and wrong for /mail/message/4ed6a3ac-860b-4607-a852-…: that
 * one arrived on the owner's home screen as "4ed6a3ac 860b 4607 A852
 * 8be01b7eab23", capitalised, as the name of somewhere he had been — and in
 * the breadcrumb above the message itself. Every detail route in the city ends
 * in an id, so this was never about mail.
 *
 * What counts as an id is deliberately narrow, because the same segment is
 * where real slugs live and a slug must survive: a uuid, a cuid, a long run of
 * hex, a long run of digits, or a long unbroken mix of letters AND digits.
 * `top-10-salons-mumbai` has hyphens and is left alone; so is any ordinary
 * word, however long.
 */
const OPAQUE = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,  // uuid
  /^c[a-z0-9]{20,}$/i,                                                 // cuid
  /^[0-9a-f]{16,}$/i,                                                  // long hex
  /^\d{6,}$/,                                                          // long number
  /^(?=.*\d)(?=.*[a-z])[a-z0-9]{12,}$/i,                               // long alnum, no separators
];
const isOpaque = (seg: string) => OPAQUE.some((re) => re.test(seg));

/** Best human title for a pathname (exact page label, else title-cased tail). */
export function titleFor(pathname: string): string {
  if (TITLE_OVERRIDE[pathname]) return TITLE_OVERRIDE[pathname];
  const page = DESTINATIONS.find((d) => d.path === pathname && d.kind !== 'action');
  if (page) return page.label;
  const seg = pathname.split('/').filter(Boolean);
  /* Drop the keys and name the thing they point at: /mail/message/<uuid>
     becomes "Message". When nothing is left but the hub itself — /services/<id>
     — the honest word is "Details", because "Local Services › Local Services"
     tells the citizen where they are twice and where they went not at all. */
  let dropped = false;
  while (seg.length && isOpaque(seg[seg.length - 1])) { seg.pop(); dropped = true; }
  if (dropped && seg.length <= 1) return 'Details';
  const tail = seg[seg.length - 1] ?? '';
  return tail ? tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Together City';
}

export interface Crumb { label: string; path?: string }

/** Breadcrumb trail: Home → Hub → Page (audit 3.3). */
export function crumbsFor(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Home', path: '/' }];
  if (pathname === '/' || !pathname) return crumbs;

  const seg = pathname.split('/').filter(Boolean);
  const first = seg[0];
  const hubKey = (Object.keys(HUBS) as HubKey[]).find((k) => k === first || HUBS[k].backPath === `/${first}`);

  if (hubKey) {
    const meta = hubMeta(hubKey);
    crumbs.push({ label: meta.name, path: meta.path });
    if (pathname !== meta.path) {
      const label = titleFor(pathname);
      // A page that carries its hub's own name (the Beauty hub is "Beauty
      // Market" and so is its shop page) would print "Beauty Market › Beauty
      // Market" — the same place said twice. Once is the truth.
      if (label !== meta.name) crumbs.push({ label });
    }
    return crumbs;
  }

  // Account / global pages: Home → Page
  crumbs.push({ label: titleFor(pathname) });
  return crumbs;
}
