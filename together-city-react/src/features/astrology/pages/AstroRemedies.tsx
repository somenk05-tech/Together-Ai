import { Card, Spinner, Tag } from '@/components/ui';
import { useAstroGems, useAstroRemedies } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';
import type { GemEntry, RemedyTemplate } from '../api';

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function GemCard({ gem, lead }: { gem: GemEntry; lead: boolean }) {
  return (
    <Card style={{ padding: '20px 22px', marginBottom: 14, borderColor: lead ? 'var(--accent)' : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, margin: 0 }}>{gem.stone}</h2>
        {lead && <Tag>For this period</Tag>}
      </div>

      {/* Labelled data — visually separate from the writing below, by design. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: '12px 16px',
        background: 'var(--paper)', borderRadius: 12, padding: '14px 16px', margin: '14px 0',
      }}>
        <Field label="Linked to" value={gem.lord} />
        <Field label="Metal" value={gem.metal} />
        <Field label="Finger" value={gem.finger} />
        <Field label="Begin on" value={gem.beginOn} />
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{gem.intention}</p>

      {gem.alternatives.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
          Also worn in its place: {gem.alternatives.join(', ')}.
        </p>
      )}
      <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '10px 0 0', color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 10, padding: '9px 12px' }}>
        {gem.caution}
      </p>
    </Card>
  );
}

export function AstroRemedies() {
  const gems = useAstroGems();
  const remedies = useAstroRemedies();

  const loading = gems.isLoading || remedies.isLoading;
  const needsProfile =
    (gems.data && 'needsProfile' in gems.data && gems.data.needsProfile) ||
    (remedies.data && 'needsProfile' in remedies.data && remedies.data.needsProfile);

  return (
    <div>
      <AstroHeader
        title="Gems & Remedies"
        lede="Stones and practices for the season you're in — offered as reflection and cultural practice, never as treatment."
      />
      <AstroTabs />

      {loading ? (
        <Spinner label="Reading your season…" />
      ) : gems.isError || remedies.isError ? (
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
          {gems.data && !('needsProfile' in gems.data && gems.data.needsProfile) && (
            <>
              <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Stones</h2>
              <GemCard gem={gems.data.primary} lead />
              <GemCard gem={gems.data.supporting} lead={false} />
            </>
          )}

          {remedies.data && !('needsProfile' in remedies.data && remedies.data.needsProfile) && (
            <>
              <h2 style={{ fontSize: 17, margin: '26px 0 12px' }}>Practices</h2>
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
