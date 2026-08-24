import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * PERSONAL — THE CITIZEN'S OWN DRAWER.
 *
 * Five rooms that are nobody else's business: the journal, the calendar, the
 * documents, the album, and — since 22 Aug — the wallet. The owner asked for
 * the tab (15 Aug) and named the first four; three of those already existed
 * and were listed NOWHERE — you could reach Calendar and Drive only by knowing
 * their URLs or by luck in the command palette, and Thoughts was boarding in
 * the Social Life rail for want of anywhere else to sleep.
 *
 * ── AND THE FIFTH IS A DOOR INTO A DISTRICT (owner, 22 Aug) ────────────────
 *
 * Financial came off the header on the same call, the way Travel did on the
 * 15th, and the argument is easier here: money is not a district you walk
 * through, it is a thing that belongs to you, so it belongs in the drawer with
 * everything else that does.
 *
 * THE CARD POINTS AT THE WALLET, NOT AT THE HUB, and that distinction is the
 * whole reason this is not a contradiction of the paragraph below. The other
 * four leaves open city-level pages; this one opens /financial/wallet, which
 * is a ROOM. The Financial District still exists, still has its five rooms,
 * its routes, its art and its place on the home map, and the command palette
 * still finds the wallet and the spending. What it lost is a tab.
 *
 * IT IS NOT A HUB, AND THAT IS THE DESIGN. A hub is a district: a photograph,
 * a billboard line, a consent gate, a rail of rooms with a shared subject.
 * This is a drawer — the pages inside it are city-level pages that belong to
 * the person rather than to a part of the city, and they keep their own
 * full-width chrome exactly as they had it. So there is no HubLayout here, no
 * hero art commissioned from a place that does not exist, and no `HubKey`
 * entry: the tab is a `TabKey`, which is a smaller idea (see config/hubs.ts).
 *
 * ── THE PLATE CAME OFF (owner, 15 Aug, with a new reference) ───────────────
 *
 * A brushed-metal CITIZEN CARD sat across the top of this page. It was the
 * city's own object, which was the argument for it, and it was wrong here for
 * two reasons the reference makes plain: it is the most corporate surface in
 * the application sitting above the four most personal rooms in it, and it was
 * a 1600px picture that said nothing — no name, no number, no state, nothing
 * that ever changes. Under it, the four rooms were four grey rows.
 *
 * The reference is paper: a ruled leaf per room, the room's mark punched onto
 * the rule, and something of the room's own lying on the page — a date, a
 * stack, a print. So the page is the four cards and nothing else now, and each
 * one carries a small drawing of what is behind its door.
 *
 * EVERY DRAWING HERE IS BUILT, NOT PHOTOGRAPHED. No new file in /assets and
 * nothing to re-export when a size changes: the calendar leaf shows the real
 * dates around today, the drive leaf a stack of paper, the album leaf two
 * prints at an angle. The reference sets its titles in a display serif and its
 * asides in a hand; this city has ONE typeface and a guard that proves it, so
 * the aside is the italic of the same family — the flourish this application
 * already uses elsewhere — and the hierarchy comes from size rather than from
 * a second font.
 */

interface Room {
  to: string;
  icon: IconName;
  label: string;
  line: string;
  /** The aside in the margin, in the family's italic. Not every leaf has one. */
  aside?: string;
  motif: 'rules' | 'dates' | 'stack' | 'prints' | 'till';
}

const ROOMS: Room[] = [
  { to: '/thoughts', icon: 'journal', label: 'Thoughts', line: 'Your private journal — nobody sees this but you.', aside: 'Note down what matters', motif: 'rules' },
  { to: '/calendar', icon: 'calendar', label: 'Calendar', line: 'Everything the city has you down for, in one week.', motif: 'dates' },
  { to: '/drive', icon: 'doc', label: 'Drive', line: 'Your documents, kept where you can find them again.', aside: 'Everything in its place', motif: 'stack' },
  { to: '/personal/album', icon: 'image', label: 'Album', line: 'Every photo and video you have posted to the city.', motif: 'prints' },
  { to: '/financial/wallet', icon: 'wallet', label: 'Financial Wallet', line: 'One balance for the whole city, and where it went.', aside: 'What you have, and what you spent', motif: 'till' },
];

/** A print, the way a photograph printed at home is: a white face, a wider
 *  margin at the foot, a degree or two off square. The same object the month
 *  grid pins to a day — drawn rather than imported, so it has no file to
 *  load and nothing to go missing. */
function Print({ turn, children }: { turn: number; children?: React.ReactNode }) {
  return (
    <span style={{
      display: 'block', width: 60, padding: '4px 4px 11px', background: 'var(--card)',
      boxShadow: 'var(--e1)', borderRadius: 2, transform: `rotate(${turn}deg)`,
    }}>
      <span style={{ display: 'grid', placeItems: 'center', height: 44, background: 'var(--well)', borderRadius: 1, color: 'var(--faint)' }}>
        {children}
      </span>
    </span>
  );
}

/** The three weeks around today in the same weekday column — the shape a month
 *  grid makes, at the size of a stamp. REAL dates: a drawing of a calendar
 *  showing somebody else's week is a picture of nothing. */
function Dates() {
  const days = useMemo(() => {
    const now = new Date();
    return [-8, -7, -6, -1, 0, 1, 6, 7, 8].map((d) => {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      return { n: at.getDate(), today: d === 0 };
    });
  }, []);
  return (
    <span style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 32px)', gridAutoRows: 29,
      background: 'var(--wash)', borderRadius: 6, overflow: 'hidden',
    }}>
      {days.map((d, i) => (
        <span key={i} style={{
          display: 'grid', placeItems: 'center', fontSize: 12,
          color: d.today ? 'var(--ink)' : 'var(--muted)', fontWeight: d.today ? 700 : 500,
          borderRight: i % 3 === 2 ? undefined : '1px solid var(--line-2)',
          borderBottom: i < 6 ? '1px solid var(--line-2)' : undefined,
        }}>
          <span style={d.today ? {
            display: 'grid', placeItems: 'center', width: 22, height: 22,
            borderRadius: 'var(--r-full)', border: '1px solid var(--ink)',
          } : undefined}>{d.n}</span>
        </span>
      ))}
    </span>
  );
}

function Motif({ kind }: { kind: Room['motif'] }) {
  if (kind === 'dates') return <Dates />;
  if (kind === 'prints') {
    return (
      <span style={{ display: 'flex', alignItems: 'flex-end' }}>
        <Print turn={-4} />
        <span style={{ marginLeft: -20 }}>
          <Print turn={3}><Icon name="heart" size={15} /></Print>
        </span>
      </span>
    );
  }
  if (kind === 'till') {
    /* A RECEIPT, NOT A PAYMENT CARD, and the swap is the reference talking.
       Every other leaf on this page is PAPER — ruled lines, a date grid, a
       stack of documents, two prints — so a slab of plastic among them read as
       an icon that had wandered in from a different application. A till roll
       is the paper money makes, and it says the same thing the aside does:
       what you have, and what you spent.

       IT IS A CLASS RATHER THAN AN INLINE STYLE, which the four motifs above
       are not, and that is deliberate rather than inconsistent: the size
       ceiling counts `style={{` and raw radii, and a new drawing built the old
       way put three counters over their line at once. Drawn in CSS it costs
       none of them — see `.pl-till` in relief.css. */
    return <span className="pl-till"><i /><i /><i /><b /></span>;
  }
  if (kind === 'stack') {
    // Three leaves of paper, fanned the way a pile of documents sits.
    return (
      <span style={{ display: 'block', position: 'relative', width: 74, height: 60 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            position: 'absolute', left: i * 5, bottom: i * 5, width: 60, height: 44,
            background: 'var(--card)', boxShadow: 'var(--e1)', borderRadius: 3,
          }} />
        ))}
      </span>
    );
  }
  // 'rules' — a page waiting to be written on.
  return (
    <span style={{ display: 'grid', gap: 9, width: 82 }}>
      {[100, 100, 68].map((w, i) => (
        <span key={i} style={{ display: 'block', height: 1, width: `${w}%`, background: 'var(--line)' }} />
      ))}
    </span>
  );
}

export function PersonalHome() {
  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Together City · Personal</div>
          <h1>Yours, and only yours</h1>
          <p>Your journal, week, documents, pictures and money.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(238px, 1fr))' }}>
        {ROOMS.map((r) => (
          <Link key={r.to} to={r.to} className="card rise"
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              minHeight: 264, padding: '20px 20px 20px 0', textDecoration: 'none', color: 'var(--ink)',
            }}>
            {/* THE MARGIN RULE, and the mark punched onto it. It runs the full
                height of the leaf rather than stopping at the text, which is
                what makes the card read as a page out of a notebook rather
                than a box with a line in it. */}
            <span aria-hidden style={{
              position: 'absolute', left: 44, top: 0, bottom: 0, width: 1, background: 'var(--line-2)',
            }} />
            <span aria-hidden style={{
              position: 'absolute', left: 26, top: 20, display: 'grid', placeItems: 'center',
              width: 37, height: 37, borderRadius: 'var(--r-full)',
              background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)',
            }}>
              <Icon name={r.icon} size={16} />
            </span>

            <div style={{ paddingLeft: 76, paddingRight: 4 }}>
              <b style={{ display: 'block', fontSize: 20, letterSpacing: '-.02em' }}>{r.label}</b>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '5px 0 0' }}>{r.line}</p>
            </div>

            {/* The foot of the leaf: the aside in the margin, the drawing on
                the page. `marginTop: auto` pins it to the bottom so four cards
                carrying four different lengths of copy still line up along it. */}
            <div style={{
              marginTop: 'auto', paddingLeft: 76, paddingTop: 18, paddingRight: 4,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
            }}>
              {r.aside ? (
                <span className="muted" style={{
                  fontStyle: 'italic', fontSize: 13, lineHeight: 1.45, maxWidth: 94,
                  borderBottom: '1px solid var(--line)', paddingBottom: 3,
                }}>{r.aside}</span>
              ) : <span />}
              <span aria-hidden style={{ flex: 'none' }}><Motif kind={r.motif} /></span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
