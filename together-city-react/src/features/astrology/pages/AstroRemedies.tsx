import { Link } from 'react-router-dom';
import { Card, Spinner, Tag } from '@/components/ui';
import { useAstroRemedies } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';
import type { RemedyTemplate } from '../api';

/**
 * Tab 05 — Gems & Remedies.
 *
 * The zone's voice rule shapes this page: the panels MAY name the machinery, the
 * prose may not. So a stone's labelled fields — stone, metal, finger, day, the
 * body it is linked to — sit in a visually separate block from the sentence
 * about what it is for, which never explains where it came from.
 */

const KIND_LABEL: Record<RemedyTemplate['kind'], string> = {
  observance: 'Observance',
  giving: 'Giving',
  practice: 'Practice',
};

export function AstroRemedies() {
  const remedies = useAstroRemedies();

  const loading = remedies.isLoading;
  const needsProfile = remedies.data && 'needsProfile' in remedies.data && remedies.data.needsProfile;

  return (
    <div>
      <AstroHeader
        title="Remedies"
        lede="Practices for the season you're in — offered as reflection and cultural practice, never as treatment."
      />
      <AstroTabs />

      {loading ? (
        <Spinner label="Reading your season…" />
      ) : remedies.isError ? (
        // Failure used to render NOTHING here — no stones, no practices, no
        // explanation. A blank sky is not an honest answer.
        <Card style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            We couldn’t read your season just now. That’s a problem on our side,
            not your chart — your birth details are untouched. Try again in a
            moment.
          </p>
        </Card>
      ) : needsProfile ? (
        <NeedsProfileCard />
      ) : (
        <>
          {/* ── THE STONES LEFT THIS PAGE ────────────────────────────────
              They were recommended here from the running period alone, while
              the Gemstones tab reads the ascendant, the ninth house, the period,
              the moon rashi and the life path. Two surfaces answering "which
              stone is mine" from two different readings is one answer too many,
              and this one had no way in from the menu — so it lost the argument
              and kept the practices, which are its own. */}
          <Card style={{ padding: '16px 20px', marginBottom: 22, background: 'var(--paper)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Stones are on their own page now</div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 10px' }}>
              Which stone suits you, which finger it is worn on, and what it costs — read from your
              whole chart rather than the current period alone.
            </p>
            <Link to="/astrology/gemstones" style={{ fontSize: 13, fontWeight: 700 }}>Go to Gemstones →</Link>
          </Card>

          {remedies.data && !('needsProfile' in remedies.data && remedies.data.needsProfile) && (
            <>
              <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Practices</h2>
              {remedies.data.remedies.map((r) => (
                <Card key={r.key} style={{ padding: '16px 20px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>{r.title}</strong>
                    <Tag>{KIND_LABEL[r.kind]}</Tag>
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '8px 0 0' }}>{r.practice}</p>
                </Card>
              ))}

              {/* Said out loud rather than shown as a quietly shorter list. */}
              {remedies.data.withheld.length > 0 && (
                <Card style={{ padding: '14px 18px', marginTop: 4, background: 'var(--paper)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    {remedies.data.withheld.length} practice{remedies.data.withheld.length === 1 ? '' : 's'} not shown
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
                    Some observances involve fasting or hard exercise, and aren’t suggested given what you’ve
                    told us about your health. Everything else is here.
                  </p>
                </Card>
              )}

              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 20 }}>
                {remedies.data.disclaimer}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
