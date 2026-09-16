import { deviceOf, hostOf, sourceOf } from '../insights/insights-math';

/** Where one visit came from, as the beacon reports it (owner, 16 Sep). */
export interface VisitOrigin {
  source: string;
  utmSource: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer: string | null;
  device: string;
}

const clip = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** The beacon's campaign fields, cleaned: short strings or nothing; the referrer reduced to its host. */
export function originOf(body: Record<string, unknown> | undefined, ua: string): VisitOrigin {
  const utmSource = clip(body?.src, 80);
  const medium = clip(body?.med, 80);
  const referrer = hostOf(clip(body?.ref, 400));
  return {
    source: sourceOf(utmSource, medium, referrer),
    utmSource, medium,
    campaign: clip(body?.cmp, 120),
    content: clip(body?.cnt, 120),
    term: clip(body?.trm, 120),
    referrer,
    device: deviceOf(ua),
  };
}
