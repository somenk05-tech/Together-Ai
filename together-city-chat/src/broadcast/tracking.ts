import { hubUrl, type Topic } from './topics';

/**
 * ── A LINK THAT SAYS WHICH POST SENT SOMEBODY (owner, 17 Sep) ──────────────
 *
 * "Every video/post should have a Click Through section … Impressions →
 * Views → Profile Visit → Link Click → Landing Page → Registration."
 *
 * The hub link in a YouTube description, a Threads post and the city's own
 * Together TV copy carries the campaign tags the city already reads
 * (api/origin.ts, analytics/visit-origin.ts):
 *
 *   utm_source   = the platform (youtube | threads | tv)
 *   utm_medium   = social
 *   utm_campaign = together-social
 *   utm_content  = the first eight characters of the MediaPost id
 *
 * so an arrival is counted against the post and the platform that sent it
 * (SocialArrival), and a member who joined after arriving that way carries
 * the same tags in MemberOrigin. Instagram gets the plain address: a link in
 * a caption is not clickable there, and a long one would only be retyped.
 */
export const CAMPAIGN = 'together-social';
export const TAG_LEN = 8;
const TAG = /^[0-9a-f]{8}$/;
export const ARRIVAL_CHANNELS = ['youtube', 'instagram', 'threads', 'tv'] as const;
export type ArrivalChannel = (typeof ARRIVAL_CHANNELS)[number];

export const tagOf = (postId: string): string => postId.replace(/-/g, '').slice(0, TAG_LEN).toLowerCase();

export function trackedLink(t: Topic, channel: ArrivalChannel, postId: string): string {
  const q = new URLSearchParams({ utm_source: channel, utm_medium: 'social', utm_campaign: CAMPAIGN, utm_content: tagOf(postId) });
  return `${hubUrl(t)}?${q.toString()}`;
}

/**
 * The tags one page load arrived with, if they are a Together Social link's.
 * Anything else — another campaign, a malformed tag, an unknown platform —
 * is not an arrival from a post.
 */
export function arrivalOf(body: Record<string, unknown> | undefined): { tag: string; channel: ArrivalChannel } | null {
  const a = body?.arrival;
  if (!a || typeof a !== 'object') return null;
  const { cmp, cnt, src } = a as Record<string, unknown>;
  if (cmp !== CAMPAIGN || typeof cnt !== 'string' || typeof src !== 'string') return null;
  const tag = cnt.toLowerCase();
  if (!TAG.test(tag) || !(ARRIVAL_CHANNELS as readonly string[]).includes(src)) return null;
  return { tag, channel: src as ArrivalChannel };
}
