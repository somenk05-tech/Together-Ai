import type { CompletionSection } from './api';
import type { HubContribution } from './types';

/**
 * THE TOGETHER CITY PASSPORT.
 *
 * The thing /profile has always struggled to say is that there is ONE identity
 * and fourteen hubs reading from it. A stack of equal cards says the opposite —
 * fourteen peers, each apparently holding its own copy of you. A travel
 * document says it in a glance: one bearer, one data page, and a sheaf of
 * endorsements that are blank until somewhere stamps them.
 *
 * IT IS DELIBERATELY NOT A REPLICA OF A REAL DOCUMENT. No country code, no
 * ICAO check digits, no crest belonging to anybody. The code band says TC and
 * is built from a handle and a join date. A convincing copy of a state's
 * passport is not a thing to leave lying in a codebase, and the design does
 * not need one — what makes this read as a document is the field grid, the
 * tracking, the engine-turned ground and the stamps.
 *
 * NOTHING HERE TOUCHES THE BACKEND. Every value is already on
 * /profile/summary, /profile/master or /profile/completion.
 */

/* ── The bits that must be the same on every render ─────────────────────── */

/** A hub's three-letter code. Derived, not tabled — a table of fourteen
 *  abbreviations is fourteen things to forget when a fifteenth hub lands. */
export const hubCode = (hub: string) => hub.slice(0, 3).toUpperCase();

/**
 * The stamp's angle, from the hub's own name.
 *
 * A stamp wants to look struck by hand, which means not square. `Math.random`
 * would do it and would also re-roll on every render — a page that will not
 * sit still while you read it, and one that cannot be screenshot-tested. The
 * name is a stable seed and gives the same tilt forever.
 */
export function tiltOf(hub: string): string {
  let n = 0;
  for (const ch of hub) n = (n * 31 + ch.charCodeAt(0)) % 1000;
  return `${(n % 17) - 9}deg`;   /* −9° … +7° */
}

const pad = (s: string, n: number) => (s + '<'.repeat(n)).slice(0, n);
const yymmdd = (iso?: string | null) => {
  if (!iso) return '<<<<<<';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '<<<<<<';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
};
const digitsOf = (s: string) => {
  let n = 0;
  for (const ch of s) n = (n * 33 + ch.charCodeAt(0)) % 1_000_000_000;
  return String(n).padStart(9, '0');
};

export function codeBand({ surname, given, handle, dob, sex, issued }: {
  surname: string; given: string; handle: string;
  dob?: string | null; sex: string; issued?: string | null;
}) {
  const up = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '<');
  return [
    pad(`P<TC${up(surname)}<<${up(given)}`, 44),
    pad(`${digitsOf(handle)}TC${yymmdd(dob)}${sex}${yymmdd(issued)}`, 44),
  ];
}


export type VisaPage = {
  hub: string;
  label: string;
  /** What the hub knows. Absent means the visa has not been issued yet. */
  summary?: string;
  href: string;
  /** 0–100 from /profile/completion, when that hub reports one. */
  percent?: number;
  complete?: boolean;
};

/**
 * Every hub gets a page, whether it has anything to say or not.
 *
 * The old grid rendered `summary.hubs` only, so a hub you had never opened was
 * simply absent — and "absent" and "nothing recorded" look identical when the
 * only thing on screen is the hubs that DO have data. A passport with a blank
 * page tells you the page exists.
 */
export function visaPages(hubs: HubContribution[], sections: CompletionSection[]): VisaPage[] {
  const byHref = new Map(sections.map((s) => [s.href, s]));
  const seen = new Set<string>();
  const pages: VisaPage[] = [];

  for (const h of hubs) {
    seen.add(h.href);
    const s = byHref.get(h.href);
    pages.push({ hub: h.hub, label: h.label, summary: h.summary, href: h.href, percent: s?.percent, complete: s?.complete });
  }
  for (const s of sections) {
    if (seen.has(s.href)) continue;
    pages.push({ hub: s.key, label: s.label, href: s.href, percent: s.percent, complete: s.complete });
  }
  return pages;
}
