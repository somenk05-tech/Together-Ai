import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { pieces, tagPath } from './captionTags';

/**
 * A CAPTION WITH ITS DOORS (owner, 16 Sep: "add tags for Together City social
 * life"). Plain text, except that each #tag links to that tag's page and each
 * @handle to that citizen's channel. Everything else is left exactly as
 * written — the caller's element keeps its own whitespace rules.
 *
 * A tap on a link never reaches the card underneath: the TV pauses on a tap,
 * and a card opens on one.
 */
export function RichText({ text }: { text: string | null | undefined }) {
  return (
    <>
      {pieces(text).map((p, i) => {
        if (p.kind === 'tag') {
          return (
            <Link key={i} to={tagPath(p.tag)} className="sl-tag" onClick={(e) => e.stopPropagation()}>
              {p.text}
            </Link>
          );
        }
        if (p.kind === 'mention') {
          return (
            <Link key={i} to={`/social/u/${encodeURIComponent(p.handle)}`} className="sl-mention"
              onClick={(e) => e.stopPropagation()}>
              {p.text}
            </Link>
          );
        }
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}
