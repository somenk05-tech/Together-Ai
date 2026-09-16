/**
 * ── A TAG IS A DOOR (owner, 16 Sep) ─────────────────────────────────────────
 *
 * "Add tags for Together City social life." The composer has offered
 * hashtags since August, and its own hint admitted what they were: words
 * added to the end of a caption, with no search and no page behind them. A
 * #tag now opens every post that carries it, and an @handle opens that
 * citizen's channel.
 *
 * ONE READING OF A CAPTION, and the web reads it the same way
 * (together-city-react/src/features/social/captionTags.ts carries the same two
 * patterns, and a test on each side pins them). If the server indexed a tag
 * the page never linked — or linked one the server never indexed — a tap
 * would open an empty room.
 *
 * WHAT COUNTS AS A TAG. `#`, then up to fifty characters that are not
 * spaces, punctuation or emoji — in any script, so #नमस्ते keeps its vowel
 * signs — and a `#` that follows the start, a space or an opening mark: `a#b`
 * is not a tag, and neither is the `#section` of a pasted address. All-digit
 * tags are left alone: "#1" is a rank, not a topic. Stored lower-case, so
 * #CityLife and #citylife are one door.
 *
 * The character set is written as an EXCLUSION list, not as "letters", because
 * the migration that indexes the captions written before today has to read
 * them the same way, and Postgres has no class for combining marks. The same
 * list, character for character, is in
 * prisma/migrations/20260916T120000_a_tag_is_a_door/migration.sql.
 *
 * WHAT COUNTS AS A MENTION. `@` then a handle as sign-up allows it
 * (`[a-z0-9_.]{3,30}`, auth.service.ts), after the start, a space or an
 * opening mark — which is what keeps an email address from reading as a
 * mention. A full stop at the end belongs to the sentence, not the handle.
 */
export const TAG_MAX_LENGTH = 50;
export const TAGS_PER_POST = 20;

/** Not a tag character: space, ASCII punctuation but `_`, Latin-1 signs, general
 *  punctuation, arrows/symbols/dingbats, CJK and full-width punctuation,
 *  variation selectors, emoji. */
export const TAG_CHAR = '[^\\s!-/:-@\\[-^`{-~\\u00A0-\\u00BF\\u00D7\\u00F7\\u2000-\\u206F\\u2190-\\u2BFF\\u3000-\\u303F\\uFE00-\\uFE0F\\uFF00-\\uFF0F\\uFF1A-\\uFF20\\uFF3B-\\uFF40\\uFF5B-\\uFF65\\u{1F000}-\\u{1FAFF}]';
/** What may stand before a `#` or an `@`. */
export const TAG_LEAD = '(^|[\\s(\\[{"\'\\u201C\\u2018\\u00AB,;:!?\\u00A1\\u00BF\\u2014\\u2013-])';

export const TAG_PATTERN = new RegExp(`${TAG_LEAD}#(${TAG_CHAR}{1,50})(?!${TAG_CHAR})`, 'gu');
export const MENTION_PATTERN = new RegExp(`${TAG_LEAD}@([A-Za-z0-9_.]{3,30})(?![A-Za-z0-9_])`, 'gu');

const TAG_WORD = new RegExp(`^${TAG_CHAR}{1,50}$`, 'u');

/** A tag as it is stored and routed: no '#', lower-case, or null if it is not one. */
export function normaliseTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().replace(/^#/, '').normalize('NFC').toLowerCase();
  if (!TAG_WORD.test(t) || /^\d+$/.test(t)) return null;
  return t;
}

/** The distinct tags in a caption, first-seen, at most TAGS_PER_POST. */
export function tagsIn(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(TAG_PATTERN)) {
    const tag = normaliseTag(m[2]);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= TAGS_PER_POST) break;
  }
  return out;
}

/** The distinct handles mentioned in a caption, lower-case, trailing dots dropped. */
export function handlesIn(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(MENTION_PATTERN)) {
    const h = m[2].replace(/\.+$/, '').toLowerCase();
    if (h.length >= 3 && !out.includes(h)) out.push(h);
  }
  return out;
}
