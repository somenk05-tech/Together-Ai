/**
 * Together City — public-ATS job connectors (the pure layer).
 *
 * Reads the PUBLIC, unauthenticated JSON job boards that companies themselves
 * publish on three ATS vendors — Greenhouse, Lever and Ashby — and keeps the
 * postings that are for India. These are the same endpoints the companies'
 * own careers pages call in the browser; nothing here scrapes a job portal,
 * logs in anywhere, or touches a site whose terms forbid automated reading.
 * Naukri/LinkedIn/Indeed are deliberately NOT sources: their terms prohibit
 * it, and a feature built on a violation is a feature with a countdown.
 *
 * Endpoint shapes and the host-allowlist discipline are ported from the
 * MIT-licensed career-ops project (github.com/santifer/career-ops,
 * providers/{greenhouse,lever,ashby}.mjs) — reused here as a server-side
 * ingest instead of its original local-first CLI. Credit where the map
 * came from.
 *
 * EVERYTHING IN THIS FILE IS PURE — parsing, filtering, classification —
 * so the spec can cover it without a network. The service owns the fetching.
 */

/** One posting as an ATS board reports it, before any Together City shaping. */
export interface AtsPosting {
  title: string;
  company: string;
  location: string;
  url: string;
  /** plain-text description when the board ships one in the list call */
  description: string;
  /** epoch ms when the board reports a date; undefined when it doesn't */
  postedAt?: number;
  /** ₹ lakhs per annum, ONLY when the source stated a real figure — never a
   *  prediction, never a guess. 0/undefined = the source did not say. */
  salaryLpa?: number;
}

/** A board slug is interpolated into a URL, so it is validated first — the
 *  company directories are third-party data and must not steer the request
 *  anywhere but the vendor's own host. Same rule career-ops applies. */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;
export function isSafeSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.length <= 100 && SLUG_RE.test(slug);
}

export const ATS_SOURCES = ['greenhouse', 'lever', 'ashby'] as const;
export type AtsSource = (typeof ATS_SOURCES)[number];

/** The one URL per vendor a validated slug may produce. */
export function boardUrl(source: AtsSource, slug: string): string {
  if (!isSafeSlug(slug)) throw new Error(`unsafe board slug: ${slug}`);
  switch (source) {
    case 'greenhouse':
      // content=true ships each posting's description in the same response —
      // one request per board, and the description is what skills parse from.
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${slug}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  }
}

/** Public directory of company slugs per ATS — the dataset career-ops scans
 *  (github.com/Feashliaa/job-board-aggregator), fetched fresh per sweep. */
export function directoryUrl(source: AtsSource): string {
  return `https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data/${source}_companies.json`;
}

/** Minimal HTML → text: strip tags, decode the entities Greenhouse actually
 *  emits, collapse whitespace. Not a sanitiser — the output is only ever
 *  matched against the skill dictionary and trimmed into a blurb. */
export function htmlToText(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const toEpochMs = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string' || !v) return undefined;
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* eslint-disable @typescript-eslint/no-explicit-any */

/** boards-api.greenhouse.io /v1/boards/{slug}/jobs?content=true */
export function normalizeGreenhouse(json: any, fallbackCompany: string): AtsPosting[] {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map((j: any): AtsPosting => ({
    title: str(j?.title),
    company: str(j?.company_name) || fallbackCompany,
    location: str(j?.location?.name),
    url: str(j?.absolute_url),
    description: htmlToText(str(j?.content)),
    postedAt: toEpochMs(j?.first_published) ?? toEpochMs(j?.updated_at),
  })).filter((p: AtsPosting) => p.title && p.url);
}

/** api.lever.co /v0/postings/{slug}?mode=json */
export function normalizeLever(json: any, fallbackCompany: string): AtsPosting[] {
  const jobs = Array.isArray(json) ? json : [];
  return jobs.map((j: any): AtsPosting => ({
    title: str(j?.text),
    company: fallbackCompany,
    location: str(j?.categories?.location),
    url: str(j?.hostedUrl),
    description: str(j?.descriptionPlain),
    postedAt: toEpochMs(j?.createdAt),
  })).filter((p: AtsPosting) => p.title && p.url);
}

/** api.ashbyhq.com /posting-api/job-board/{slug}. Ashby keeps extra hiring
 *  regions in secondaryLocations[] — folded in, because "Remote" primary with
 *  an India secondary IS an India posting (career-ops learned this the hard
 *  way and this port keeps the lesson). */
export function normalizeAshby(json: any, fallbackCompany: string): AtsPosting[] {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map((j: any): AtsPosting => {
    const parts: string[] = [];
    if (str(j?.location).trim()) parts.push(str(j.location).trim());
    if (Array.isArray(j?.secondaryLocations)) {
      for (const s of j.secondaryLocations) if (str(s?.location).trim()) parts.push(str(s.location).trim());
    }
    return {
      title: str(j?.title),
      company: fallbackCompany,
      location: parts.join('; '),
      url: str(j?.jobUrl) || str(j?.applyUrl),
      description: str(j?.descriptionPlain) || htmlToText(str(j?.descriptionHtml)),
      postedAt: toEpochMs(j?.publishedAt),
    };
  }).filter((p: AtsPosting) => p.title && p.url);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function normalize(source: AtsSource, json: unknown, fallbackCompany: string): AtsPosting[] {
  switch (source) {
    case 'greenhouse': return normalizeGreenhouse(json, fallbackCompany);
    case 'lever': return normalizeLever(json, fallbackCompany);
    case 'ashby': return normalizeAshby(json, fallbackCompany);
  }
}

/**
 * IS THIS POSTING FOR INDIA?
 *
 * Decided from the LOCATION FIELD ONLY. A description mentioning "India"
 * proves nothing ("customers across India"), and a bare "Remote" with no
 * country is a job for everywhere and nowhere — flooding an Indian citizen's
 * matches with roles that may be US-payroll-only would be the feed inventing
 * relevance. The rule: the location names India, an Indian city, or a
 * remote-in-India arrangement.
 */
const INDIAN_CITY_RE = new RegExp(
  '\\b(?:' + [
    'india', 'bengaluru', 'bangalore', 'mumbai', 'bombay', 'delhi', 'new delhi', 'gurgaon', 'gurugram',
    'noida', 'hyderabad', 'pune', 'chennai', 'madras', 'kolkata', 'ahmedabad', 'jaipur', 'kochi', 'cochin',
    'chandigarh', 'indore', 'coimbatore', 'thiruvananthapuram', 'trivandrum', 'lucknow', 'nagpur', 'surat',
    'visakhapatnam', 'vizag', 'bhubaneswar', 'mysuru', 'mysore', 'vadodara', 'goa',
  ].join('|') + ')\\b', 'i',
);
export function isIndiaPosting(location: string): boolean {
  return INDIAN_CITY_RE.test(location ?? '');
}

/** A location that says remote — used for the JobLike `remote` flag, never
 *  for the India decision above. */
export function isRemoteLocation(location: string): boolean {
  return /\bremote\b|\bwork from home\b|\bwfh\b/i.test(location ?? '');
}

/** Seniority from the title alone — the only signal an external posting
 *  reliably carries. Defaults to 'mid', the matcher's gentlest assumption. */
export function seniorityFromTitle(title: string): 'junior' | 'mid' | 'senior' | 'lead' {
  const t = ` ${title.toLowerCase()} `;
  if (/\b(intern|trainee|fresher|graduate|junior|jr\.?|entry)\b/.test(t)) return 'junior';
  if (/\b(head|director|vp|principal|staff|architect|lead)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  return 'mid';
}

/** Company display name from a directory slug — the directories carry slugs,
 *  not names ("10pearls" → "10pearls"). Where the board response names the
 *  company (Greenhouse's company_name) that wins; this is only the fallback,
 *  and it deliberately does NOT prettify: inventing capitalisation invents
 *  a name. */
export function companyFromSlug(slug: string): string {
  return slug;
}

/* ══ THE AGGREGATORS — Adzuna and Jooble ═══════════════════════════════════
   Licensed APIs, keyed by the owner (see .env.example), that index boards
   the three ATS vendors don't host. They are QUERY services, not company
   directories, so the sweep asks them a rotating set of questions instead
   of walking a list of boards. Both requests are country-scoped to India by
   construction — Adzuna's /jobs/in/ endpoint, Jooble's location field — so
   their answers are NOT re-filtered through the city list: a posting in
   Salem or Guwahati is an India posting whether or not the list has heard
   of the town. The endpoint is the authority; the list is only for boards
   that mix countries. */

export const AGGREGATOR_SOURCES = ['adzuna', 'jooble'] as const;
export type AggregatorSource = (typeof AGGREGATOR_SOURCES)[number];

/** What the sweep asks the aggregators, one industry at a time — the same
 *  breadth the skill dictionary covers, so a nurse's CV has postings to
 *  match against, not only an engineer's. Rotated a few per run. */
export const AGGREGATOR_QUERIES: readonly string[] = [
  'software engineer', 'react developer', 'python developer', 'java developer', 'devops engineer',
  'data analyst', 'machine learning', 'product manager', 'ui ux designer', 'mobile developer',
  'accountant', 'financial analyst', 'nurse', 'teacher', 'sales manager',
  'human resources', 'operations manager', 'customer support', 'content writer', 'marketing',
  'legal associate', 'project manager',
];

export function adzunaSearchUrl(appId: string, appKey: string, what: string, page = 1): string {
  const q = new URLSearchParams({
    app_id: appId, app_key: appKey, what,
    results_per_page: '50', 'content-type': 'application/json',
  });
  return `https://api.adzuna.com/v1/api/jobs/in/search/${page}?${q.toString()}`;
}

export const JOOBLE_HOST = 'https://jooble.org/api/';
export function joobleRequestBody(what: string, page = 1): string {
  return JSON.stringify({ keywords: what, location: 'India', page: String(page) });
}

/** INR/year → ₹ LPA, kept ONLY when the figure is stated (not predicted) and
 *  lands in a sane band. Everything else is 0 = "the source did not say". */
export function inrYearToLpa(min: unknown, max: unknown, predicted: unknown): number {
  if (predicted === '1' || predicted === 1 || predicted === true) return 0;
  const lo = typeof min === 'number' && min > 0 ? min : 0;
  const hi = typeof max === 'number' && max > 0 ? max : 0;
  const mid = lo && hi ? (lo + hi) / 2 : lo || hi;
  const lpa = Math.round(mid / 100_000);
  return lpa >= 1 && lpa <= 500 ? lpa : 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** api.adzuna.com /v1/api/jobs/in/search/{page} */
export function normalizeAdzuna(json: any): AtsPosting[] {
  const jobs = Array.isArray(json?.results) ? json.results : [];
  return jobs.map((j: any): AtsPosting => ({
    title: str(j?.title).replace(/<[^>]+>/g, '').trim(),
    company: str(j?.company?.display_name),
    location: str(j?.location?.display_name),
    url: str(j?.redirect_url),
    description: htmlToText(str(j?.description)),
    postedAt: toEpochMs(j?.created),
    salaryLpa: inrYearToLpa(j?.salary_min, j?.salary_max, j?.salary_is_predicted),
  })).filter((p: AtsPosting) => p.title && p.url && p.company);
}

/** jooble.org /api/{key} (POST). Salary arrives as a free-text string in
 *  assorted formats — not parsed, because a misread "₹40,000/month" printed
 *  as 40 LPA is worse than no salary line at all. */
export function normalizeJooble(json: any): AtsPosting[] {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs.map((j: any): AtsPosting => ({
    title: htmlToText(str(j?.title)),
    company: str(j?.company),
    location: str(j?.location),
    url: str(j?.link),
    description: htmlToText(str(j?.snippet)),
    postedAt: toEpochMs(j?.updated),
  })).filter((p: AtsPosting) => p.title && p.url && p.company && p.location.trim() !== '');
  // company required on both aggregators: a role nobody claims to be hiring
  // for is not something the city can honestly put a name to on a card.
}

/* eslint-enable @typescript-eslint/no-explicit-any */
