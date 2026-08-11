import { useId } from 'react';
import { Card, Spinner } from '@/components/ui';
import { useAstroGemstones } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';
import type { GemAtWeight, GemRecommendation, GemRole } from '../api';

/**
 * Tab 05 — Gemstones.
 *
 * THIS IS THE OWNER'S REFERENCE, NOT AN INTERPRETATION OF IT. The first build
 * of this page was an app-native card — photograph on the left, facts in a grey
 * grid on the right — which was a perfectly good product row and threw away the
 * entire composition. The reference makes each stone A PAGE: a capsule at the
 * top, three trait words arched over the photograph, the name beneath in
 * engraved capitals, warm prose under that, and a price ring at the foot,
 * centred the whole way down. Two stones side by side stop being pages and
 * start being products, so they never are.
 *
 * NOT A CATALOGUE. Thirty stones exist and this page opens on at most five,
 * each carrying the ROLE it plays in this particular chart. The order of
 * operations is chart → recommendation → stone, and the shelf is never the
 * first thing anybody sees.
 *
 * ── WHERE THE COLOUR COMES FROM, BECAUSE IT MATTERS ─────────────────────────
 *
 * Every card in the reference is themed to its own stone — a ruby's title in
 * oxblood, an emerald's in deep green. relief.spec forbids colour written into
 * a page, and rightly: a hex typed here is a decision made outside the system.
 * These are not typed here. They arrive in the catalogue payload beside the
 * photograph and the price, they are the owner's data, and they are applied as
 * custom properties on the card element — the same category of thing as the
 * photograph itself. Nothing in this file names a colour; `gem-is-the-owners`
 * asserts that it never starts to.
 *
 * ── WHAT WAS ADDED TO THE REFERENCE, IN THE REFERENCE'S OWN FORMAT ──────────
 *
 * The reference sheet has two labelled sections — WHEN YOU WEAR IT and WHY IT
 * IS RECOMMENDED. This page is personalised, so it has more to say, and all of
 * it is said the same way: a tracked label and a centred paragraph. WHY THIS
 * STONE, FOR YOU carries the chart's own reasoning; HOW IT IS WORN carries the
 * finger, the hand, the metal and the day; WORN ON TRIAL FIRST appears only on
 * the three stones that need it; WORN IN ITS PLACE names the cheaper stone for
 * the same planet. No new visual vocabulary was invented for any of them.
 *
 * THE ONE DELIBERATE DEVIATION is the badge. The reference puts the stone's
 * catalogue number in a thin circle at the top of the card. Here the stones are
 * ordered by what they do for THIS chart, so a "3" on the first sheet would be
 * answering a question nobody asked. The circle becomes a capsule carrying the
 * role — the same weight, in the same place, saying something true of the
 * reader rather than of the database.
 */

const ROLE_LABEL: Record<GemRole, string> = {
  life: 'Life stone',
  fortune: 'Fortune stone',
  period: 'For this period',
  moon: 'Moon stone',
  number: 'Number stone',
};

const ROLE_NOTE: Record<GemRole, string> = {
  life: 'Worn for a lifetime rather than a season.',
  fortune: 'The second stone of the traditional pair.',
  period: 'For the years you are in now — this one changes.',
  moon: 'Read from where the moon was when you were born.',
  number: 'From numerology rather than the chart.',
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** A tracked label. Every section on the sheet is introduced by one of these. */
function Sub({ children }: { children: string }) {
  return <div className="gem-sub" style={{ color: 'var(--gem-accent)' }}>{children}</div>;
}

/**
 * The three trait words, arched over the stone.
 *
 * The geometry is the reference's own — a 130-radius arc across a 360×170 box.
 * `useId` because two sheets on one page would otherwise share a path id and
 * the second one's text would follow the first one's curve, which looks exactly
 * like a rendering bug and is a duplicate-id bug.
 */
function TraitArc({ words }: { words: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 360 170" className="gem-arc" aria-hidden focusable="false">
      <defs><path id={id} d="M 50 160 A 130 130 0 0 1 310 160" fill="none" /></defs>
      {/* Size and tracking live in layout.css, where a media query can reach
          them — the longest trait line in the catalogue is six characters
          longer than the ruby's, and text that overruns its path is clipped
          rather than wrapped. */}
      <text fill="var(--gem-accent)" textAnchor="middle">
        <textPath href={`#${id}`} startOffset="50%">{words}</textPath>
      </text>
    </svg>
  );
}

/** One labelled fact, centred — the reference has no table in it. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gem-body)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function StoneSheet({ rec }: { rec: GemRecommendation }) {
  const { gem, wearing } = rec;
  return (
    <Card
      className="gem-sheet"
      style={{
        // The stone's own palette, from the catalogue. Read as variables by the
        // rules above rather than repeated at every element.
        '--gem-title': gem.theme.title,
        '--gem-body': gem.theme.body,
        '--gem-accent': gem.theme.accent,
      } as React.CSSProperties}
    >
      <span className="gem-cap" style={{ color: 'var(--gem-title)', borderColor: 'var(--gem-accent)' }}>
        {ROLE_LABEL[rec.role]}
      </span>

      <TraitArc words={gem.traits.join(' · ').toUpperCase()} />

      <div className="gem-photo">
        {/* `no-case` is relief.css's own exemption from the frame every
            photograph gets. These are cut-out stones multiplied onto the sheet;
            an outline and a drop shadow would put a box around a picture
            composed not to need one. */}
        <img className="no-case" src={gem.image} alt={gem.imageAlt} loading="lazy" width={250} height={220} />
      </div>

      <h2 className="gem-display" style={{ color: 'var(--gem-title)' }}>{gem.name}</h2>
      <p className="gem-body" style={{ color: 'var(--gem-body)' }}>{gem.description}</p>

      {/* ── the personalised section, and the reason this page exists ────────
          The reference is a catalogue sheet and has nothing like it. It goes
          first among the labelled sections because it is the only one written
          about the reader rather than about the stone. */}
      <Sub>Why this stone, for you</Sub>
      {rec.reasons.map((r) => (
        <p key={r} className="gem-body" style={{ color: 'var(--gem-body)', marginTop: 8 }}>{r}</p>
      ))}
      <p className="gem-body" style={{ color: 'var(--gem-body)', marginTop: 8, fontStyle: 'italic' }}>
        {ROLE_NOTE[rec.role]}
      </p>

      <Sub>How it is worn</Sub>
      <div className="gem-facts">
        <Fact label="Finger" value={wearing.finger} />
        <Fact label="Hand" value={wearing.hand} />
        <Fact label="Metal" value={wearing.metal} />
        <Fact label="First worn" value={wearing.day} />
      </div>

      <Sub>When you wear it</Sub>
      <p className="gem-body" style={{ color: 'var(--gem-body)' }}>{gem.whatYouFeel}</p>
      <p className="gem-body" style={{ color: 'var(--gem-body)', fontSize: 11.5, marginTop: 8, opacity: .85 }}>
        {gem.wearingNote}
      </p>

      <Sub>Why it is recommended</Sub>
      <p className="gem-body" style={{ color: 'var(--gem-body)' }}>{gem.whyRecommended}</p>

      {/* Only on the three stones traditionally worn on trial — and they are,
          not coincidentally, three of the dearest things in the catalogue. */}
      {rec.trialNote && (
        <>
          <Sub>Worn on trial first</Sub>
          <p className="gem-body" style={{ color: 'var(--gem-body)' }}>{rec.trialNote}</p>
        </>
      )}

      {rec.substitutes.length > 0 && (
        <>
          {/* A DIAMOND IS ₹150,000 A CARAT AND A WHITE SAPPHIRE IS ₹6,000. A
              page that answers "which stone" honestly and "what it costs" not
              at all is half an answer. */}
          <Sub>Worn in its place</Sub>
          <div className="gem-facts" style={{ marginTop: 4 }}>
            {rec.substitutes.map((s: GemAtWeight) => (
              <span key={s.gem.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <img className="no-case" src={s.gem.image} alt="" aria-hidden loading="lazy" width={34} height={34}
                  style={{ width: 34, height: 34, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                <span style={{ fontSize: 12.5, textAlign: 'left' }}>
                  <span style={{ fontWeight: 700 }}>{s.gem.name}</span>
                  {/* THE HEAVIER WEIGHT IS THE POINT. A per-carat price a fifth
                      of the primary's, at nearly twice the carats, is not a
                      fifth of the cost — and finding that out at the counter is
                      what this line exists to prevent. */}
                  {s.weight && s.fromInr !== null
                    ? <span style={{ display: 'block', color: 'var(--gem-body)' }}>{s.weight.carats} ct · from {rupees(s.fromInr)}</span>
                    : <span style={{ display: 'block', color: 'var(--gem-body)' }}>from {rupees(s.gem.perCaratMinInr)}/ct</span>}
                </span>
              </span>
            ))}
          </div>
          <p className="gem-body" style={{ color: 'var(--gem-body)', fontSize: 11.5, marginTop: 10 }}>
            The same planet at a fraction of the price, worn heavier — the tradition asks about
            three-quarters again the weight of the primary stone.
          </p>
        </>
      )}

      {/* ── how much stone, and therefore what it costs ─────────────────────
          A PRICE PER CARAT IS NOT A PRICE. "₹8,000 – ₹25,000 per carat" tells
          nobody anything until they know how many carats they are prescribed,
          and that is a property of the WEARER rather than of the stone. */}
      <Sub>How much to wear</Sub>
      {rec.weight ? (
        <>
          <div className="gem-weight" style={{ color: 'var(--gem-title)' }}>
            {rec.weight.carats} <span style={{ fontSize: '.42em', letterSpacing: '.2em' }}>CARATS</span>
          </div>
          <p className="gem-body" style={{ color: 'var(--gem-body)' }}>
            About {rec.weight.ratti} ratti — the traditional rule is one ratti for every ten kilos of
            body weight. Anything from {rec.weight.fromCt} to {rec.weight.toCt} carats is the same
            prescription; have a jeweller or astrologer confirm it before you commission the stone.
          </p>
          <div>
            <span className="gem-price" style={{ color: 'var(--gem-title)', borderColor: 'var(--gem-accent)' }}>
              {rupees(rec.fromInr ?? 0)} – {rupees(rec.toInr ?? 0)} AT THIS WEIGHT
            </span>
          </div>
          <p className="gem-body" style={{ color: 'var(--gem-body)', fontSize: 11, marginTop: 10 }}>
            {rupees(gem.perCaratMinInr)} – {rupees(gem.perCaratMaxInr)} per carat. Where you land inside
            that is the quality of the stone, which you choose next.
          </p>
        </>
      ) : (
        <>
          {/* NO BODY WEIGHT, NO FIGURE — the same refusal the ascendant gets
              without a birth time, and for a larger sum of money. */}
          <p className="gem-body" style={{ color: 'var(--gem-body)' }}>
            The weight is worked out from your body weight, which we don’t have. Add it to your
            profile and the carats and the price appear — we won’t guess at it.
          </p>
          <div>
            <span className="gem-price" style={{ color: 'var(--gem-title)', borderColor: 'var(--gem-accent)' }}>
              {rupees(gem.perCaratMinInr)} – {rupees(gem.perCaratMaxInr)} PER CARAT
            </span>
          </div>
        </>
      )}
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
            {([
              ['Ascendant', data.chart.ascendant ?? 'Birth time needed'],
              ['Moon sign', data.chart.moonSign],
              ['Current period', data.chart.mahadasha],
              ['Within it', data.chart.antardasha],
              ['Life path', String(data.chart.lifePath)],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>

          {data.timeUnknown && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 640 }}>
              Two of the five stones are read from your ascendant, which needs the time you were
              born. Add it to your astrology profile and they appear — we haven’t guessed at them.
            </p>
          )}

          <div style={{ textAlign: 'center', margin: '0 0 20px' }}>
            <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Recommended for you</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              {data.recommendations.length} stone{data.recommendations.length === 1 ? '' : 's'} out of thirty. The rest of the
              catalogue is not shown, because it isn’t yours.
            </p>
          </div>

          {data.recommendations.map((rec) => <StoneSheet key={rec.gem.id} rec={rec} />)}

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 20, textAlign: 'center', maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            {data.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
