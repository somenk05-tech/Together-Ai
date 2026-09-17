import { hubUrl, SITE, type Topic } from './topics';
import type { YouTubeMeta } from './platforms';

/**
 * ── ONE SET OF WORDS, FITTED TO EACH WALL ───────────────────────────────────
 *
 * The owner approves a title, a description, tags, one caption and one
 * Threads line. What each platform receives is built HERE, from those and the
 * topic, so the rules the audit set are applied the same way every time:
 *
 *   - every post sends people to its own hub (dating → /matchmaking,
 *     health → /medical …) — the "connect dating with dating" of the ask;
 *   - the topic's disclaimer is never dropped to make room;
 *   - three hashtags, the topic's, and never more than a platform allows;
 *   - "made with AI" is said when the owner ticks it — as YouTube's own
 *     altered-content flag AND in words, because Instagram and Threads have
 *     no such field in their APIs.
 *
 * Every limit below is the platform's own, and text is cut at a word, never
 * mid-word, and never inside the footer.
 */

export interface Words {
  title: string;
  description: string;
  tags: string[];
  caption: string;
  threadsText: string;
  privacy: 'public' | 'unlisted' | 'private';
  aiDisclosure: boolean;
}

export const LIMITS = {
  ytTitle: 100,
  ytDescriptionBytes: 5000,
  ytTagChars: 500,
  igCaption: 2200,
  igHashtags: 30,
  threadsText: 500,
} as const;

export const AI_LINE = 'Made with AI-generated visuals.';

/** YouTube refuses < and > anywhere in a title or description. */
const noAngles = (s: string) => s.replace(/[<>]/g, '');

/** Cut to `max` code points, at a word where one is near. */
export function cut(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join('');
  const space = head.lastIndexOf(' ');
  return `${(space > max * 0.6 ? head.slice(0, space) : head).trimEnd()}…`;
}

/** Cut to `max` UTF-8 bytes, at a word. */
function cutBytes(text: string, max: number): string {
  if (Buffer.byteLength(text) <= max) return text;
  let out = '';
  for (const ch of Array.from(text)) {
    if (Buffer.byteLength(out + ch) > max - 3) break;
    out += ch;
  }
  const space = out.lastIndexOf(' ');
  return `${(space > out.length * 0.6 ? out.slice(0, space) : out).trimEnd()}…`;
}

function footer(t: Topic, ai: boolean): string[] {
  return [t.disclaimer, ai ? AI_LINE : null].filter((l): l is string => Boolean(l));
}

/**
 * YouTube tags: 500 characters in all, where YouTube counts a comma between
 * tags and two quote marks around a tag that has a space in it.
 */
export function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const raw of tags) {
    const tag = noAngles(raw.replace(/^#/, '').replace(/,/g, ' ').trim()).slice(0, 100);
    if (!tag || out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    const cost = tag.length + (tag.includes(' ') ? 2 : 0) + (out.length ? 1 : 0);
    if (used + cost > LIMITS.ytTagChars) break;
    out.push(tag);
    used += cost;
  }
  return out;
}

export function youtubeMeta(w: Words, t: Topic): YouTubeMeta {
  const tail = [
    '',
    `▶ More on Together City: ${hubUrl(t)}`,
    ...footer(t, w.aiDisclosure),
    '',
    t.hashtags.join(' '),
  ].join('\n');
  const room = LIMITS.ytDescriptionBytes - Buffer.byteLength(tail);
  return {
    snippet: {
      title: cut(noAngles(w.title).trim() || t.label, LIMITS.ytTitle),
      description: cutBytes(noAngles(w.description).trim(), room) + noAngles(tail),
      tags: fitTags([...w.tags, 'Together City', t.label]),
      categoryId: t.youtube.categoryId,
      defaultLanguage: 'en',
      defaultAudioLanguage: 'en',
    },
    status: {
      privacyStatus: w.privacy,
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: w.aiDisclosure,
      embeddable: true,
      license: 'youtube',
    },
  };
}

/** The hashtags a caption already carries, lower-cased. */
const tagsIn = (s: string) => (s.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase());

export function instagramCaption(w: Words, t: Topic): string {
  const own = tagsIn(w.caption);
  const extra = t.hashtags.filter((h) => !own.includes(h.toLowerCase()));
  const tail = [
    '',
    `More on Together City — link in bio (${SITE.replace('https://', '')}${t.hubPath === '/' ? '' : t.hubPath})`,
    ...footer(t, w.aiDisclosure),
    ...(extra.length ? ['', extra.join(' ')] : []),
  ].join('\n');
  let body = cut(w.caption.trim(), LIMITS.igCaption - Array.from(tail).length);
  // Instagram refuses a caption with more than 30 hashtags; the owner's own go first.
  const budget = LIMITS.igHashtags - extra.length;
  let seen = 0;
  body = body.replace(/#[\p{L}\p{N}_]+/gu, (h) => (++seen > budget ? h.slice(1) : h));
  return body + tail;
}

export function threadsText(w: Words, t: Topic): string {
  const link = hubUrl(t);
  const lines = [...footer(t, w.aiDisclosure), link];
  const tail = `\n\n${lines.join('\n')}`;
  return cut(w.threadsText.trim() || w.caption.trim(), LIMITS.threadsText - Array.from(tail).length) + tail;
}

/** The words on the city's own copy: the title, the caption, the topic's tags (a #tag is a door there). */
export function tvText(w: Words, t: Topic): string {
  const own = tagsIn(w.caption);
  const extra = t.hashtags.filter((h) => !own.includes(h.toLowerCase()));
  return [w.title.trim(), w.caption.trim(), ...footer(t, w.aiDisclosure), extra.join(' ')]
    .filter(Boolean).join('\n\n');
}
