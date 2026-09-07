import { Link } from 'react-router-dom';
import { HEADER_TABS, NAV } from '@/config/hubs';
import { useCityDesign } from '@/hooks/useCityDesign';

/**
 * THE FOUR DOORS, UNDER THE CODE (owner, 7 Sep).
 *
 * The hero already says what the city is and the QR says how to carry it; what
 * it did not say, anywhere above the fold on a desktop, is WHERE TO GO. The
 * header row carries the four doors, but a header is chrome — the eye reads it
 * as furniture and slides past it to the page. This is the same four doors as
 * a decision on the page itself, at the end of the sentence the hero starts.
 *
 * IT IS THE SAME LIST, NOT A SECOND ONE. `HEADER_TABS` is the owner's order —
 * Personalize, Digital Store, Local Market, Together TV — and this row maps it
 * exactly as Header.tsx, CityDrawer.tsx and Hubs.tsx do, through NAV for the
 * label and the path. A hard-coded copy of four links here is how the fifth
 * door gets added in three places and forgotten in the fourth.
 *
 * AND IT WEARS THE CITIZEN'S DESIGN. A hub switched off in Design Your
 * Services loses its door here at render, the way it loses its tab. Signed
 * out, loading or on error, `hubOn` answers true for everything and all four
 * stand.
 */
export function CityDoors() {
  const { hubOn } = useCityDesign();
  const doors = HEADER_TABS
    .map((key) => NAV.find((n) => n.key === key))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .filter((n) => hubOn(n.key));

  // Every door switched off is a citizen's decision, not an empty row to draw
  // a border around. Design Your Services already says where the switch is.
  if (doors.length === 0) return null;

  return (
    <nav className="doors" aria-label="The four doors of the city">
      {doors.map((d) => (
        <Link key={d.key} className="door" to={d.path}>
          {/* The bloom is drawn, not painted on the link, so the word sits ON
              the glass rather than inside the blur. aria-hidden because it is
              light, not language. */}
          <span className="door-bloom" aria-hidden />
          <span className="door-word">{d.label}</span>
        </Link>
      ))}
    </nav>
  );
}
