/**
 * ── A TAG IS A DOOR (owner, 16 Sep) ─────────────────────────────────────────
 *
 * "Add tags for Together City social life." A caption's #tags and @handles
 * are links: a tag opens every post carrying it (/social/tags/:tag), a handle
 * opens that citizen's channel (/social/u/:handle).
 *
 * THE SAME READING AS THE SERVER. The four patterns below are copied line for
 * line from together-city-chat/src/social/tags.ts, and a server spec
 * (a-tag-is-a-door.spec.ts) fails the build if they drift: a link to a tag the
 * server never filed would open an empty page.
 */
export const TAG_CHAR = '[^\\s!-/:-@\\[-^`{-~\\u00A0-\\u00BF\\u00D7\\u00F7\\u2000-\\u206F\\u2190-\\u2BFF\\u3000-\\u303F\\uFE00-\\uFE0F\\uFF00-\\uFF0F\\uFF1A-\\uFF20\\uFF3B-\\uFF40\\uFF5B-\\uFF65\\u{1F000}-\\u{1FAFF}]';
export const TAG_LEAD = '(^|[\\s(\\[{"\'\\u201C\\u2018\\u00AB,;:!?\\u00A1\\u00BF\\u2014\\u2013-])';

// eslint-disable-next-line no-misleading-character-class -- U+FE00–FE0F are excluded on purpose: a variation selector is not part of a tag.
export const TAG_PATTERN = new RegExp(`${TAG_LEAD}#(${TAG_CHAR}{1,50})(?!${TAG_CHAR})`, 'gu');
export const MENTION_PATTERN = new RegExp(`${TAG_LEAD}@([A-Za-z0-9_.]{3,30})(?![A-Za-z0-9_])`, 'gu');

// eslint-disable-next-line no-misleading-character-class -- U+FE00–FE0F are excluded on purpose: a variation selector is not part of a tag.
const TAG_WORD = new RegExp(`^${TAG_CHAR}{1,50}$`, 'u');

/** A tag as the server stores and routes it: no '#', lower-case, or null. */
export function normaliseTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().replace(/^#/, '').normalize('NFC').toLowerCase();
  if (!TAG_WORD.test(t) || /^\d+$/.test(t)) return null;
  return t;
}

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'tag'; text: string; tag: string }
  | { kind: 'mention'; text: string; handle: string };

/**
 * A caption in pieces, in order, nothing dropped: joining every piece's
 * `text` gives the caption back exactly. A mention's trailing full stop is
 * left as text, because it belongs to the sentence.
 */
export function pieces(caption: string | null | undefined): Piece[] {
  const text = caption ?? '';
  const hits: Array<{ at: number; end: number; piece: Piece }> = [];
  for (const m of text.matchAll(TAG_PATTERN)) {
    const tag = normaliseTag(m[2]);
    if (!tag) continue;
    const at = (m.index ?? 0) + m[1].length;
    hits.push({ at, end: at + 1 + m[2].length, piece: { kind: 'tag', text: `#${m[2]}`, tag } });
  }
  for (const m of text.matchAll(MENTION_PATTERN)) {
    const raw = m[2].replace(/\.+$/, '');
    if (raw.length < 3) continue;
    const at = (m.index ?? 0) + m[1].length;
    hits.push({ at, end: at + 1 + raw.length, piece: { kind: 'mention', text: `@${raw}`, handle: raw.toLowerCase() } });
  }
  hits.sort((a, b) => a.at - b.at);
  const out: Piece[] = [];
  let from = 0;
  for (const h of hits) {
    if (h.at < from) continue;
    if (h.at > from) out.push({ kind: 'text', text: text.slice(from, h.at) });
    out.push(h.piece);
    from = h.end;
  }
  if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
  return out;
}

/** Where a tag's page is. */
export const tagPath = (tag: string) => `/social/tags/${encodeURIComponent(tag)}`;
