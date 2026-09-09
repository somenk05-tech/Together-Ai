import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCitySwitches } from '@/hooks/useCityDesign';

/**
 * ── A ROOM THE OPERATOR CLOSED (owner, 9 Sep) ───────────────────────────────
 *
 * "Create kill switches for each tab."
 *
 * A hub's kill switch refuses the hub's API, and the citizen finds out when the
 * page they opened fills with error cards — acceptable for a whole district,
 * where the door is gone from every menu at the same time. For a ROOM it is
 * not: the rest of the hub still stands, the rail is still there, and a room
 * that draws its furniture and then turns red one request at a time reads as
 * broken rather than as closed.
 *
 * So a closed room says so, in front of the page, before anything is asked
 * for. The API refuses too — that is the half that makes it a kill switch
 * rather than a hidden link — but a citizen should meet a sentence, not a
 * stack of 503s.
 *
 * ── IT SITS IN `wrap`, WHICH EVERY PAGE GOES THROUGH ────────────────────────
 *
 * One place, 173 routes. A gate a route has to opt into is a gate the next
 * route forgets, and the failure would be invisible: the page renders, the
 * requests 503, and only the citizen sees it.
 *
 * ── AND IT FAILS OPEN ───────────────────────────────────────────────────────
 *
 * `closedPages` is empty while the switch list is loading, when the request
 * fails, and against a server too old to send it. Every one of those draws the
 * room. A convenience that has not answered yet must never be the reason a
 * citizen cannot reach a page — the same rule every other reader of these
 * switches follows.
 */
export function RoomGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const switches = useCitySwitches();
  if (switches.pageOpen(pathname)) return <>{children}</>;
  return <RoomClosed />;
}

/**
 * WHAT IT SAYS, AND WHAT IT DOES NOT SAY.
 *
 * Not "you do not have access", which is untrue and sends somebody to support
 * asking what they did. Not "this page does not exist", which is untrue and
 * makes a returning citizen think they imagined it. It is temporary, it is
 * everybody, and nothing they put here has gone anywhere — those three
 * sentences are the whole of what a citizen needs and all this can honestly
 * claim, since the page cannot know the operator's reason.
 */
function RoomClosed() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: '52ch', margin: '48px auto', textAlign: 'center', display: 'grid', gap: 10, padding: '30px 26px' }}>
        <div aria-hidden style={{ fontSize: 26 }}>◍</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>This room is closed just now</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          Together City has switched it off for everybody while something is sorted out — it is
          not you, and it is not permanent. Nothing you have saved here has been touched, and it
          will all be where you left it when the room opens again.
        </p>
        <p style={{ fontSize: 13.5, margin: '4px 0 0' }}>
          <Link to="/" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>Back to your city</Link>
        </p>
      </div>
    </div>
  );
}
