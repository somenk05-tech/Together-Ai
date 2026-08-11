import { Card, Spinner, Tag } from '@/components/ui';
import { useAstroGemstones } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';
import type { GemRecommendation, GemRole, GemStone } from '../api';

/**
 * Tab 05 — Gemstones.
 *
 * NOT A CATALOGUE. Thirty stones exist and this page opens on at most five,
 * each carrying the ROLE it plays in this particular chart. A marketplace that
 * opens on all thirty is a jewellery site with an astrology theme; the order of
 * operations here is chart → recommendation → stone, and the shelf is never the
 * first thing anybody sees.
 *
 * THE VOICE RULE APPLIES AND IT ALLOWS THIS. The Astrology Zone forbids a
 * LETTER from naming rashi, lagna or dasha — a reading that explains its own
 * machinery stops being a reading. Labelled panels are the standing exception,
 * which is how the chart chips and the tarot faces have always worked, and a
 * marketplace is the clearest case for it: somebody spending ₹90,000 on a stone
 * is owed the reason in plain words, including the technical ones.
 *
 * THE PHOTOGRAPHS ARE THE OWNER'S, extracted from the stone-pages reference and
 * keyed by stone id. They are shot on white, so the card ground is white and
 * the stone sits on it without a frame — the reference's own composition, and
 * the reason there is no border on the image.
 */

const ROLE_LABEL: Record<GemRole, string> = {
  life: 'Life stone',
  fortune: 'Fortune stone',
  period: 'For this period',
  moon: 'Moon stone',
  number: 'Number stone',
};

/** What the role means, said once, in the citizen's language. */
const ROLE_NOTE: Record<GemRole, string> = {
  life: 'Worn for a lifetime rather than a season.',
  fortune: 'The second stone of the traditional pair.',
  period: 'For the years you are in now — this one changes.',
  moon: 'Read from where the moon was when you were born.',
  number: 'From numerology rather than the chart.',
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** One labelled fact. The wearing details are data and are laid out as data. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function StoneCard({ rec, lead }: { rec: GemRecommendation; lead: boolean }) {
  const { gem, wearing } = rec;
  return (
    <Card style={{ padding: 0, marginBottom: 16, overflow: 'hidden', borderColor: lead ? 'var(--accent)' : 'var(--line)' }}>
      <div className="gem-card">
        {/* The stone, on the white it was photographed on. */}
        <div className="gem-shot">
          {/* `no-case` is relief.css's own exemption from the global frame every
              photograph gets. These thirty are cut-out stones on white, composed
              to float; an outline and a drop shadow would put a box around a
              picture that was shot not to need one. Using the escape hatch the
              system provides beats overriding the rule beside it. */}
          <img className="no-case" src={gem.image} alt={gem.imageAlt} loading="lazy" width={220} height={220}
            style={{ width: '100%', height: 'auto', maxWidth: 220, objectFit: 'contain' }} />
          <div className="gem-traits">{gem.traits.join(' · ')}</div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Tag>{ROLE_LABEL[rec.role]}</Tag>
            <span className="muted" style={{ fontSize: 11.5 }}>{ROLE_NOTE[rec.role]}</span>
          </div>
          <h2 className="gem-name">{gem.name}</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: '2px 0 0' }}>{gem.description}</p>

          {/* ── how it is worn ──────────────────────────────────────────────
              THE FIRST QUESTION ANYBODY ASKS about a prescribed stone is which
              finger, and until now the answer lived on a page with no way in.
              Four labelled facts, above the reasoning rather than beneath it. */}
          <div className="gem-wear">
            <Field label="Finger" value={wearing.finger} />
            <Field label="Hand" value={wearing.hand} />
            <Field label="Metal" value={wearing.metal} />
            <Field label="First worn" value={wearing.day} />
          </div>

          <div>
            <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
              Why this stone, for you
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rec.reasons.map((r) => (
                <li key={r} style={{ fontSize: 13, lineHeight: 1.6 }}>{r}</li>
              ))}
            </ul>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>Price per carat</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {rupees(gem.perCaratMinInr)} – {rupees(gem.perCaratMaxInr)}
              </div>
            </div>
            {/* NO "DESIGN THIS STONE" BUTTON YET, and its absence is deliberate.
                The next screen is a carat weight and a quality slider, and the
                recommended weight is the one field the owner's data has not
                reached us yet. A CTA onto a page that has to invent how much
                stone somebody should buy is worse than no CTA. */}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5, maxWidth: 260, lineHeight: 1.5, textAlign: 'right' }}>
              What it costs depends on the weight your chart calls for and the quality you choose.
            </span>
          </div>

          {/* Traditional practice, and the reason it is here is that these three
              stones are the expensive ones. */}
          {rec.trialNote && (
            <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 10, padding: '10px 12px' }}>
              <strong>Worn on trial first.</strong> {rec.trialNote}
            </p>
          )}

          {rec.substitutes.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Worn in its place
              </div>
              {/* A DIAMOND IS ₹150,000 A CARAT AND A WHITE SAPPHIRE IS ₹6,000.
                  Showing only the primary would be a marketplace that answers
                  "which stone" honestly and "what it costs" not at all. */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {rec.substitutes.map((s: GemStone) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img className="no-case" src={s.image} alt="" aria-hidden loading="lazy" width={30} height={30}
                      style={{ width: 30, height: 30, objectFit: 'contain' }} />
                    <span style={{ fontSize: 12.5 }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span className="muted"> · from {rupees(s.perCaratMinInr)}/ct</span>
                    </span>
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '8px 0 0' }}>
                The same planet at a fraction of the price. Traditionally worn heavier than the primary stone.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AstroGemstones() {
  const q = useAstroGemstones();
  const data = q.data;
  const needsProfile = Boolean(data && 'needsProfile' in data && data.needsProfile);

  return (
    <div>
      <AstroHeader
        title="Gemstones"
        lede="Only the stones your own chart calls for — what each one is for, which finger it is worn on, and what it costs."
      />
      <AstroTabs />

      {q.isLoading ? (
        <Spinner label="Reading your chart…" />
      ) : q.isError ? (
        <Card style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            We couldn’t read your chart just now. That’s a problem on our side, not your
            birth details — they’re untouched. Try again in a moment.
          </p>
        </Card>
      ) : needsProfile || !data ? (
        <NeedsProfileCard />
      ) : (
        <>
          {/* ── what this was read from ────────────────────────────────────
              A LABELLED STRIP, NOT PROSE. The zone's voice rule forbids a
              letter from naming the machinery; a panel of named fields is the
              standing exception, and somebody about to spend real money is owed
              the reason in the technical words as well as the plain ones. */}
          <div className="gem-chart">
            <Field label="Ascendant" value={data.chart.ascendant ?? 'Birth time needed'} />
            <Field label="Moon sign" value={data.chart.moonSign} />
            <Field label="Current period" value={data.chart.mahadasha} />
            <Field label="Within it" value={data.chart.antardasha} />
            <Field label="Life path" value={String(data.chart.lifePath)} />
          </div>

          {data.timeUnknown && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 640 }}>
              Two of the five stones are read from your ascendant, which needs the time you were
              born. Add it to your astrology profile and they appear — we haven’t guessed at them.
            </p>
          )}

          <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Recommended for you</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px' }}>
            {data.recommendations.length} stone{data.recommendations.length === 1 ? '' : 's'} out of thirty. The rest of the
            catalogue is not shown, because it isn’t yours.
          </p>

          {data.recommendations.map((rec, i) => (
            <StoneCard key={rec.gem.id} rec={rec} lead={i === 0} />
          ))}

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 20 }}>{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
