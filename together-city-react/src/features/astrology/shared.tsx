import { Link, useLocation } from 'react-router-dom';
import { Button, Card } from '@/components/ui';

/** Prompt shown wherever a reading needs birth details that aren't stored yet. */
export function NeedsProfileCard() {
  return (
    <Card className="page-note centred" style={{ padding: '36px 28px' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🔭</div>
      <h2 style={{ fontFamily: 'var(--serif)', marginBottom: 10 }}>Complete Your Birth Details</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 18 }}>
        Your guidance is written from your birth details — saved once, used across Together AI.
      </p>
      <Link to="/profile/astrology"><Button variant="accent">Complete Birth Details</Button></Link>
    </Card>
  );
}

const TABS = [
  { path: '/astrology/monthly', label: '01 · This Month' },
  { path: '/astrology/ask', label: '02 · Ask the Astrologer' },
  { path: '/astrology/tarot', label: '03 · Tarot' },
  { path: '/astrology/gemstones', label: '04 · Gemstones' },
  { path: '/astrology/gem-checkout', label: '05 · Checkout' },
];

/** Shared tab bar for the three Astrology Zone tabs. */
export function AstroTabs() {
  const { pathname } = useLocation();
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      {TABS.map((t) => (
        <Link key={t.path} to={t.path}
          style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
            color: pathname === t.path ? 'var(--accent)' : 'var(--muted)',
            borderBottom: `2px solid ${pathname === t.path ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
          {t.label}
        </Link>
      ))}
      <Link to="/profile/astrology" style={{ marginLeft: 'auto', padding: '10px 4px', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
        ⚙ Astrology Profile
      </Link>
    </div>
  );
}

/**
 * THE POSTER, ON THE SIX SCREENS THAT SHARE THIS HEADER (owner, 6 Sep: "make
 * the other text on top too in the same design as the other"). The same
 * `.astra` block the consultation room and the tarot table wear: the corners,
 * the title as the large line with its last word in the italic, the lede as
 * the tracked line beneath. No labels — these rooms have nothing to tuck
 * around the title — and one word alone stays in capitals.
 */
export function AstroHeader({ title, lede }: { title: string; lede: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  return (
    <header className="astra rise">
      <div className="astra-in">
        <p className="astra-corners" aria-hidden><span>Astrology Zone</span><span>Together City</span></p>
        <div className="astra-stage">
          <h1 className="astra-line">{words.join(' ')}{last && <> <em className="i">{last}</em></>}</h1>
        </div>
        <p className="astra-after">{lede}</p>
      </div>
    </header>
  );
}
