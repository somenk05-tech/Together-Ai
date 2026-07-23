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
      <AstroHeader title="Today's Guidance" lede="Personal guidance from your Vedic birth chart, today's transits, your Dasha period and numerology — practical reflection and encouragement, offered as guidance rather than fixed prediction." />
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
              {d.numerology && <Tag>🔢 Life Path {d.numerology.lifePath}</Tag>}
              {d.numerology && <Tag>Personal Day {d.numerology.personalDay}</Tag>}
              {d.dasha && <Tag>🪐 {d.dasha.maha} Dasha</Tag>}
              <Tag>{new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Tag>
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(20px,2.4vw,26px)', marginBottom: 6 }}>{d.theme}</h2>

            {d.sections && d.sections.length > 0 ? (
              <>
                <div style={{ marginTop: 10 }}>
                  {d.sections.map((s) => (
                    <div key={s.key} style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14.5 }}>
                        <span aria-hidden>{s.icon}</span>{s.title}
                      </div>
                      <p style={{ fontSize: 14.5, lineHeight: 1.7, margin: '4px 0 0', color: 'var(--ink-soft)' }}>{s.body}</p>
                    </div>
                  ))}
                </div>

                {d.lucky && (
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 20, background: 'var(--accent-soft)', borderRadius: 12, padding: '12px 16px' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>✨ Lucky today</span>
                    <span style={{ fontSize: 13 }}>Number <b>{d.lucky.number}</b></span>
                    <span style={{ fontSize: 13 }}>Colour <b style={{ textTransform: 'capitalize' }}>{d.lucky.color}</b></span>
                    <span style={{ fontSize: 13 }}>Best time <b>{d.lucky.time}</b></span>
                    <span style={{ fontSize: 13 }}>Direction <b style={{ textTransform: 'capitalize' }}>{d.lucky.direction}</b></span>
                  </div>
                )}

                {d.reflection && (
                  <div style={{ marginTop: 16, borderLeft: '3px solid var(--accent)', padding: '6px 0 6px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>🪞 Daily Reflection</div>
                    <p style={{ fontSize: 14, lineHeight: 1.65, margin: '4px 0 0' }}>{d.reflection}</p>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 15.5, lineHeight: 1.75, marginTop: 10 }}>{d.text}</p>
            )}

            <p className="muted" style={{ fontSize: 11.5, marginTop: 18, fontStyle: 'italic' }}>
              {d.framing ?? `Saved to your profile · written once for ${d.date} from your chart and today's actual planetary positions.`}
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
