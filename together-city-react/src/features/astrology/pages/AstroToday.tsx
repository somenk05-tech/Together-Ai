import { useState } from 'react';
import { Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useAstroDaily, useAstroDailyHistory } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';

/** Tab 01 — Today's Horoscope. One saved prediction per user per day, written
 *  from the birth chart + today's transits; a new one begins at the user's
 *  own midnight and every past day stays on the profile. */
export function AstroToday() {
  const daily = useAstroDaily();
  const history = useAstroDailyHistory();
  const [showPast, setShowPast] = useState(false);
  const d = daily.data;
  const past = (history.data ?? []).filter((h) => h.date !== d?.date).slice(0, 7);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px' }}>
      <AstroHeader title="Today's Horoscope" lede="A personalized daily reading from your Vedic birth chart (sidereal · Jyotish) and today's planetary transits." />
      <AstroTabs />
      {daily.isLoading && <Spinner label="Reading today's sky…" />}
      {daily.isError && <EmptyState title="Couldn't reach the stars" hint="Reload in a moment." />}
      {d && d.needsProfile && <NeedsProfileCard />}
      {d && !d.needsProfile && (
        <>
          <Card className="rise" style={{ padding: '26px 26px 22px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Tag>☀️ {d.sunSign}</Tag>
              <Tag>🌙 {d.moonPhase}</Tag>
              <Tag>{new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Tag>
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(20px,2.4vw,26px)', marginBottom: 12 }}>{d.theme}</h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.75 }}>{d.text}</p>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>
              Saved to your profile · written once for {d.date} from your chart and today's actual planetary positions.
            </p>
          </Card>

          {past.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <button type="button" onClick={() => setShowPast((v) => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13.5, padding: 0, fontFamily: 'inherit' }}>
                {showPast ? '▾ Hide previous days' : `▸ Previous days (${past.length})`}
              </button>
              {showPast && past.map((h) => (
                <Card key={h.date} style={{ marginTop: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <b style={{ fontSize: 13.5 }}>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{h.theme}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{h.text}</p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
