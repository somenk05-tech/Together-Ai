/**
 * The allergy rule, given a voice. (K5.66.)
 *
 * The consumer review's keep-list called the allergy propagation the best idea
 * in the product — tell the city once that you cannot eat nuts and meals,
 * shopping, restaurants and even face cream change — and its one complaint was
 * that nobody is ever told it happened.
 *
 * SO THIS IS DELIBERATELY NOT A WARNING. It is not red, it does not use the ⚠️
 * the error states own, and it does not apologise. Something correct and
 * protective just happened, and the tone should say so: this is the city
 * quietly doing its job and mentioning it. Red here would teach people to
 * dismiss it, and this is the one line we want them to actually read.
 *
 * The "Change this" link matters as much as the sentence. allergens.ts leans
 * towards excluding where a list is uncertain — coconut counts as a tree nut —
 * which is the right default and is sometimes wrong for a given person. The
 * link is how a wrong exclusion becomes a fixable one.
 */
import { Link } from 'react-router-dom';

export interface AllergyNoticeShape { terms: string[]; removed: number; sentence: string }

export function AllergyNote({ notice, manageTo = '/nutrition/preferences' }: {
  notice: AllergyNoticeShape | null | undefined;
  /** Where this citizen edits the declaration that acted. */
  manageTo?: string;
}) {
  if (!notice || notice.removed < 1) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        fontSize: 13, lineHeight: 1.5, color: 'var(--ink-soft)',
        background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-1)', padding: '9px 13px', margin: '12px 0',
      }}
    >
      <span aria-hidden="true">🛡</span>
      <span>{notice.sentence}</span>
      <Link to={manageTo} style={{ fontWeight: 600, color: 'var(--accent-ink)', textDecoration: 'none' }}>
        Change this →
      </Link>
    </div>
  );
}

/**
 * The per-item version, for surfaces that show the thing and mark it: a search
 * result they typed the name of, a dish on a menu they opened on purpose.
 */
export function AllergyMarkTag({ mark }: { mark: { label: string } | null | undefined }) {
  if (!mark) return null;
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 11.5, fontWeight: 600,
        color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-soft)',
        borderRadius: 8, padding: '3px 9px', marginTop: 6,
      }}
    >
      {mark.label}
    </span>
  );
}
