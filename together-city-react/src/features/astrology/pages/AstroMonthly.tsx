import { Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useAstroMonthly } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';

/** Tab 02 — Monthly Horoscope. A premium magazine-style reading (2,000–4,000
 *  words) written once per user per month from their chart and the month's
 *  real planetary events. */
export function AstroMonthly() {
  const monthly = useAstroMonthly();
  const m = monthly.data;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px' }}>
      <AstroHeader title="Monthly Horoscope" lede="Your month ahead — career, money, love, health, family and travel, written from your Vedic (sidereal) birth chart like a premium astrology magazine." />
      <AstroTabs />
      {monthly.isLoading && <Spinner label="Composing your month…" />}
      {monthly.isError && <EmptyState title="Couldn't load the monthly reading" hint="Reload in a moment." />}
      {m && m.needsProfile && <NeedsProfileCard />}
      {m && !m.needsProfile && (
        <>
          <Card className="rise" style={{ padding: '26px 26px 18px', marginBottom: 18 }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(21px,2.6vw,28px)', marginBottom: 10 }}>{m.title}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {m.bestDates.length > 0 && <Tag>✨ Best: {m.bestDates.join(', ')}</Tag>}
              {m.cautionDates.length > 0 && <Tag>⚠️ Caution: {m.cautionDates.join(', ')}</Tag>}
              <Tag>{m.words.toLocaleString('en-IN')} words</Tag>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
              Written once for {m.month} from your birth chart and this month's actual planetary movements — saved to your profile.
            </p>
          </Card>
          {m.sections.map((s, i) => (
            <Card key={s.key} className={`rise d${Math.min(i, 4)}`} style={{ padding: '22px 26px', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, marginBottom: 10 }}>{s.title}</h3>
              {s.body.split('\n\n').map((p, j) => (
                <p key={j} style={{ fontSize: 14.5, lineHeight: 1.75, marginBottom: 10 }}>{p}</p>
              ))}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
