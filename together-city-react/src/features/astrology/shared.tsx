import { Link, useLocation } from 'react-router-dom';
import { Button, Card } from '@/components/ui';

/** Prompt shown wherever a reading needs birth details that aren't stored yet. */
export function NeedsProfileCard() {
  return (
    <Card style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', padding: '36px 28px' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🔭</div>
      <h2 style={{ fontFamily: 'var(--serif)', marginBottom: 10 }}>Complete Your Birth Details</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 18 }}>
        To generate your personalized horoscope, compatibility reports, and birth chart, please add your
        birth details. This information is saved once in your Master Profile and automatically used
        across Together AI.
      </p>
      <Link to="/profile/astrology"><Button variant="accent">Complete Birth Details</Button></Link>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Already added these during onboarding or dating? They're reused automatically — you never enter them twice.
      </p>
    </Card>
  );
}

const TABS = [
  { path: '/astrology/today', label: "01 · Today's Horoscope" },
  { path: '/astrology/monthly', label: '02 · Monthly Horoscope' },
  { path: '/astrology/ask', label: '03 · Ask the Astrologer' },
  { path: '/astrology/tarot', label: '04 · Tarot' },
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

export function AstroHeader({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="rise" style={{ marginBottom: 18 }}>
      <div className="eyebrow">Astrology Zone</div>
      <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  );
}
