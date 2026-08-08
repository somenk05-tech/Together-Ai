import { Link } from 'react-router-dom';

/**
 * THE MASTHEAD — the one thing every Real Estate page opens with.
 *
 * Three columns: the mark, sixty words saying what this page is, and a small
 * right-aligned column of where else to go. It replaces two different openings
 * that were in the hub before — Explore's full-bleed `<Hero>` banner, and the
 * `eyebrow` + `<h1>` pair on every other page — so that the hub reads as one
 * publication instead of six screens that happen to share a sidebar.
 *
 * THE WORDMARK IS THE PAGE, NOT THE HUB. A masthead that says the same word on
 * all six pages is a logo, and you stop reading it by the second page. Each
 * page names itself, in the same setting, so the family is obvious and your
 * location still is.
 *
 * The hairspace-around-the-dash is the reference's signature and the reason
 * `mark` takes an array rather than a string: `Real – Estate` with ordinary
 * spaces is a different, worse piece of typography, and passing the joined
 * string would leave every call site to remember a character it cannot see.
 *
 * A ONE-ELEMENT ARRAY GETS NO DASH, which is the whole reason it is a join
 * and not a fixed pair. The setting suits compound names — Real–Estate,
 * Under–Construction, Review–Queue — and mangles a phrase: `List–a Property`
 * is not typography, it is a rule applied without looking.
 */

const HAIR = ' ';   /* U+200A HAIR SPACE — the thinnest space there is. */

export type NavItem =
  /** A different page. */
  | { label: string; to: string; on?: boolean }
  /** A filter on THIS page — a control, so it renders as a button. */
  | { label: string; onSelect: () => void; on?: boolean };

export function Masthead({
  mark, title, children, nav, registered,
}: {
  /** The page's name, split where the dash goes: ['Real', 'Estate']. */
  mark: string[];
  /** The standfirst's bold first line. */
  title: string;
  /** The standfirst body — plain sentences, not a feature list. */
  children: React.ReactNode;
  nav?: NavItem[];
  /** The ® belongs to the hub's front door and nowhere else. */
  registered?: boolean;
}) {
  return (
    <div className="emast">
      <h1 className="ewordmark">
        {mark.join(`${HAIR}–${HAIR}`)}
        {registered && <sup>®</sup>}
      </h1>
      <p className="estand"><b>{title}</b>{children}</p>
      {nav && nav.length > 0 && (
        <nav className="enav">
          {nav.map((item) => ('to' in item
            ? <Link key={item.label} to={item.to} className={item.on ? 'on' : undefined}>{item.label}</Link>
            : <button key={item.label} type="button" className={item.on ? 'on' : undefined}
                onClick={item.onSelect}>{item.label}</button>
          ))}
        </nav>
      )}
    </div>
  );
}
