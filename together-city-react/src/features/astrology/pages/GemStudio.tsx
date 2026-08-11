import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Spinner } from '@/components/ui';
import { useLockGem, useGemDesign, useGemMetals } from '../hooks';
import { AstroHeader, NeedsProfileCard } from '../shared';
import { payError } from '@/features/financial/api';
import type { DesignVerdict, MetalKey, SettingOption, StudioOption } from '../api';

/**
 * The design studio — where "add to cart" goes.
 *
 * IT IS NOT A CART AND DELIBERATELY NOT ONE. A gemstone is not a product you
 * put in a basket; it is a COMMISSION. Nothing about it is decided until
 * somebody has said ring or pendant, which cut, which mount, which metal and
 * what size — and every one of those has an answer the chart has an opinion
 * about. A basket that held "1 × Blue Sapphire" and asked the questions later
 * would be a basket holding nothing anybody could make.
 *
 * So the button beside each stone brings you here, with that stone, at the
 * weight you are prescribed, and the page asks the questions in the order a
 * jeweller would.
 *
 * THE CHART HAS AN OPINION AND IT IS SHOWN, NOT ENFORCED. The metal and the
 * finger come from the wearing table; the settings are judged against this
 * stone's own planet — a tension mount will crack a pearl, an eternity band has
 * no open back and is fashion wear whatever the chart says, a three-stone only
 * works with the planet's allies. Every one of those is labelled and every one
 * is still choosable. Somebody who wants the eternity band can have it; they
 * cannot have it without being told.
 *
 * NOTHING IS CHARGED HERE. This page decides WHAT is being made; the checkout
 * decides what is being paid for. Both buttons lock the design — "Commission"
 * is the same lock with the checkout on the end of it — so somebody who wants
 * one stone never meets a cart they did not ask for, and somebody choosing
 * three does not pay three separate times.
 *
 * THE PRICE MOVES WITH QUALITY, NOT WITH WEIGHT. The carats are the chart's
 * business and are fixed here; where you land between the cheapest and dearest
 * grade of the same stone is yours, and it is the only slider on the page.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const VERDICT_LABEL: Record<DesignVerdict, string> = {
  recommended: 'Recommended',
  suitable: 'Suitable',
  avoid: 'Not for a prescribed stone',
};

/** The line drawings are the owner's, delivered as SVG strings. They carry no
 *  script and no external reference — see `studio-is-line-art` — and they are
 *  inlined so they can inherit the ink of the card they sit on. */
function Glyph({ svg }: { svg: string }) {
  return <span className="gem-glyph" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Choice(
  { option, selected, onPick, note }:
  { option: StudioOption; selected: boolean; onPick: () => void; note?: React.ReactNode },
) {
  return (
    <button type="button" onClick={onPick} aria-pressed={selected}
      className={`gem-choice${selected ? ' is-on' : ''}`}>
      <Glyph svg={option.svg} />
      <span className="gem-choice-name">{option.name}</span>
      <span className="gem-choice-desc">{option.desc}</span>
      {note}
    </button>
  );
}

export function GemStudio() {
  const { gemId = '' } = useParams();
  const q = useGemDesign(gemId);
  const lock = useLockGem();
  const navigate = useNavigate();
  const data = q.data;

  const [worn, setWorn] = useState<'ring' | 'pendant' | 'loose'>('ring');
  const [shape, setShape] = useState('oval');
  const [setting, setSetting] = useState('solitaire');
  const [style, setStyle] = useState('classic');
  const [size, setSize] = useState(16);
  /** 0 is the cheapest grade of this stone, 100 the finest. */
  const [grade, setGrade] = useState(35);
  const [metal, setMetal] = useState<MetalKey>('gold22');


  const design = worn === 'ring' ? setting : style;
  const metals = useGemMetals(gemId, worn, design, size);
  const metalQuote = metals.data?.metals.find((m) => m.key === metal) ?? null;

  const stoneInr = useMemo(() => {
    if (!data || data.fromInr === null || data.toInr === null) return null;
    return Math.round(data.fromInr + ((data.toInr - data.fromInr) * grade) / 100);
  }, [data, grade]);
  // The metal is nothing on a loose stone, and the server agrees — it prices
  // the same two parts from the same files rather than trusting this sum.
  const priceInr = stoneInr === null ? null : stoneInr + (worn === 'loose' ? 0 : metalQuote?.priceInr ?? 0);

  if (q.isLoading) return <Spinner label="Sizing your stone…" />;
  if (q.isError || !data) {
    return (
      <Card style={{ padding: '18px 22px' }}>
        <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t open the studio for that stone. <Link to="/astrology/gemstones">Back to your gemstones</Link>.
        </p>
      </Card>
    );
  }
  if ('needsProfile' in data && data.needsProfile) return <NeedsProfileCard />;

  const { gem, weight, wearing } = data;
  const chosenSetting = data.settings.find((s) => s.key === setting);
  const lockPayload = {
    gemId: gem.id, grade, worn, shape,
    metal: worn === 'loose' ? undefined : metal,
    setting: worn === 'ring' ? setting : undefined,
    style: worn === 'pendant' ? style : undefined,
    size: worn === 'ring' ? size : undefined,
  };
  const stone = `${gem.name} · ${weight?.carats ?? '?'} ct · ${data.shapes.find((s) => s.key === shape)?.name}`;
  const summary = worn === 'loose'
    ? `${stone} · loose, unset — to be set in ${wearing.metal.toLowerCase()}, ${wearing.finger.toLowerCase()} of the ${wearing.hand.toLowerCase()}, open back`
    : worn === 'ring'
      ? `${stone} · ${chosenSetting?.name} · ${metalQuote ? `${metalQuote.name} (${metalQuote.grams} g)` : wearing.metal} · size ${size}`
      : `${stone} · ${data.pendantStyles.find((s) => s.key === style)?.name} pendant · ${metalQuote ? `${metalQuote.name} (${metalQuote.grams} g)` : wearing.metal}`;

  return (
    <div>
      <AstroHeader title="Design your stone" lede={`${gem.name}, at the weight your chart calls for.`} />
      <Link to="/astrology/gemstones" style={{ fontSize: 12.5, fontWeight: 700 }}>← Back to your gemstones</Link>

      <div className="gem-studio-head card" style={{ marginTop: 14 }}>
        <img className="no-case" src={gem.image} alt={gem.imageAlt} width={140} height={140}
          style={{ width: 140, height: 140, objectFit: 'contain', mixBlendMode: 'multiply' }} />
        <div>
          <h2 className="gem-display" style={{ fontSize: 26, margin: 0 }}>{gem.name}</h2>
          {data.standsInFor && (
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              Standing in for {data.standsInFor.toLowerCase()} — the same planet, worn heavier.
            </p>
          )}
          {weight ? (
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: '8px 0 0' }}>
              <strong>{weight.carats} carats</strong> ({weight.ratti} ratti), worn on the{' '}
              {wearing.finger.toLowerCase()} of the {wearing.hand.toLowerCase()}, set in {wearing.metal.toLowerCase()},
              first worn on a {wearing.day}.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>
              Add your weight to your profile and we’ll size the stone — we won’t guess at it.
            </p>
          )}
        </div>
      </div>

      {/* ── 01 how you will wear it, or whether we set it at all ────────────
          Ring first because the wearing table names a finger, which is the
          traditional form. A pendant is a real alternative and not a lesser one
          — a stone at the chest touches the skin exactly as a ring does.

          AND THE STONE ON ITS OWN, which is the option a jewellery site would
          not offer and this one has no reason to withhold. Plenty of people
          have a jeweller they already trust, or a setting in the family that
          wants a new stone in it. Refusing to sell them the gem would be
          holding the thing they came for hostage to a service they did not
          ask for. */}
      <h2 className="gem-step">01 · How will you wear it?</h2>
      <div className="gem-choices">
        {([
          ['ring', 'As a ring', `On the ${wearing.finger.toLowerCase()}, ${wearing.hand.toLowerCase()} — the traditional form for this stone`, true],
          ['pendant', 'As a pendant', 'Worn at the chest, against the skin — the same contact, a different place', false],
          ['loose', 'Just the stone', 'Loose and unset, for your own jeweller. We send the gem and the specification it should be set to.', false],
        ] as const).map(([k, name, desc, rec]) => (
          <button key={k} type="button" onClick={() => setWorn(k)} aria-pressed={worn === k}
            className={`gem-choice gem-choice-wide${worn === k ? ' is-on' : ''}`}>
            <span className="gem-choice-name">{name}</span>
            <span className="gem-choice-desc">{desc}</span>
            {rec && <span className="gem-verdict is-recommended">Traditional</span>}
          </button>
        ))}
      </div>

      <h2 className="gem-step">02 · The cut</h2>
      <p className="muted gem-step-note">
        Jyotish favours a clean, unchipped stone over a dazzling one — oval and cushion keep the
        most weight, which is why they are the usual choice for a prescribed gem.
      </p>
      <div className="gem-choices">
        {data.shapes.map((o) => (
          <Choice key={o.key} option={o} selected={shape === o.key} onPick={() => setShape(o.key)} />
        ))}
      </div>

      {worn === 'loose' ? (
        /* Nothing to choose beyond the cut — but the stone still leaves with
           the instructions, because an unset gem and no specification is half
           a purchase. */
        <Card style={{ marginTop: 18, padding: '18px 22px' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>What your jeweller will need</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            Set in <strong>{wearing.metal.toLowerCase()}</strong>, worn on the{' '}
            <strong>{wearing.finger.toLowerCase()}</strong> of the {wearing.hand.toLowerCase()},
            with an <strong>open back</strong> so the stone touches the skin — that last part is the
            one jewellers most often close up, and it is the point of a prescribed stone.
            First worn on a {wearing.day}.
          </p>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>
            This goes on your receipt, so you can hand it over as it is.
          </p>
        </Card>
      ) : worn === 'ring' ? (
        <>
          <h2 className="gem-step">03 · The setting</h2>
          <p className="muted gem-step-note">
            Judged for {gem.name.toLowerCase()} specifically. Anything marked otherwise is still
            yours to choose — we would rather say why than take the option away.
          </p>
          <div className="gem-choices">
            {data.settings.map((o: SettingOption) => (
              <Choice key={o.key} option={o} selected={setting === o.key} onPick={() => setSetting(o.key)}
                note={<span className={`gem-verdict is-${o.verdict}`}>{VERDICT_LABEL[o.verdict]}</span>} />
            ))}
          </div>
          {chosenSetting && (
            <p className="gem-step-note" style={{ color: chosenSetting.verdict === 'avoid' ? 'var(--warn-ink)' : undefined }}>
              {chosenSetting.why}
            </p>
          )}

          <h2 className="gem-step">04 · Your size</h2>
          <p className="muted gem-step-note">
            Indian sizes. Measure at the end of the day, when fingers are largest — and if your
            knuckle is wider than the base, size for the knuckle and take the nearer size up.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <input type="range" min={data.sizes[0].indian} max={data.sizes[data.sizes.length - 1].indian} step={1}
              value={size} aria-label="Indian ring size"
              onChange={(e) => setSize(Number(e.target.value))}
              style={{ flex: 1, minWidth: 220, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{size}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {data.sizes.find((s) => s.indian === size)?.diameterMm} mm across ·{' '}
              {data.sizes.find((s) => s.indian === size)?.circumferenceMm} mm around
            </span>
          </div>
        </>
      ) : (
        <>
          <h2 className="gem-step">03 · The pendant</h2>
          <div className="gem-choices">
            {data.pendantStyles.map((o) => (
              <Choice key={o.key} option={o} selected={style === o.key} onPick={() => setStyle(o.key)} />
            ))}
          </div>
        </>
      )}

      {/* ── the metal ───────────────────────────────────────────────────────
          Priced by the gram against the day's rate, for the mount and size
          chosen above — a cluster in size 22 carries nearly twice the gold of a
          solitaire in size 8, so this re-quotes as those change rather than
          showing one number for everything.

          The metal the tradition names for this planet is marked, and the other
          two are still there. Silver instead of gold is a legitimate choice and
          often the one somebody can actually make. */}
      {worn !== 'loose' && (
        <>
          <h2 className="gem-step">{worn === 'ring' ? '05' : '04'} · The metal</h2>
          <p className="muted gem-step-note">
            Priced at today&rsquo;s rate for the {metals.data?.metals[0]?.grams ?? '—'} grams this
            design takes. What the jeweller quotes on the day can differ a little.
          </p>
          <div className="gem-choices">
            {(metals.data?.metals ?? []).map((m) => (
              <button key={m.key} type="button" onClick={() => setMetal(m.key)} aria-pressed={metal === m.key}
                className={`gem-choice gem-choice-wide${metal === m.key ? ' is-on' : ''}`}>
                <span className="gem-choice-name">{m.name}</span>
                <span className="gem-choice-desc">{m.grams} g · {rupees(m.priceInr)}</span>
                {m.traditional && <span className="gem-verdict is-recommended">Traditional for this stone</span>}
              </button>
            ))}
            {metals.isLoading && <span className="muted" style={{ fontSize: 12.5 }}>Pricing the metal…</span>}
          </div>
        </>
      )}

      {/* ── the quality axis, and the only slider that changes the price ──── */}
      {weight && data.fromInr !== null && data.toInr !== null && (
        <>
          <h2 className="gem-step">{worn === 'ring' ? '06' : worn === 'pendant' ? '05' : '03'} · The grade of the stone</h2>
          <p className="muted gem-step-note">
            The weight is your chart’s business and is fixed. Where you land between the plainest
            and the finest stone of that weight is yours — colour, clarity and origin, all at{' '}
            {weight.carats} carats.
          </p>
          <input type="range" min={0} max={100} step={5} value={grade}
            aria-label="Grade of the stone"
            onChange={(e) => setGrade(Number(e.target.value))}
            style={{ width: '100%', margin: '4px 0 6px', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 11 }}>{rupees(data.fromInr)} · everyday grade</span>
            <span className="muted" style={{ fontSize: 11 }}>{rupees(data.toInr)} · the finest we source</span>
          </div>
        </>
      )}

      <Card style={{ marginTop: 22, padding: '22px 24px' }}>
        <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>What you are commissioning</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{summary}</p>

        {/* Two lines, because they are two things — and no third line. The
            making charge is inside the metal figure at the owner's instruction,
            which is ordinary jewellery practice: the price shown is the price
            paid and nothing is added at checkout. */}
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', margin: '16px 0 0', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <dt className="muted" style={{ fontSize: 12.5 }}>The stone · {weight?.carats} ct</dt>
          <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{stoneInr === null ? '—' : rupees(stoneInr)}</dd>
          {worn !== 'loose' && metalQuote && (
            <>
              <dt className="muted" style={{ fontSize: 12.5 }}>{metalQuote.name} · {metalQuote.grams} g, made up</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{rupees(metalQuote.priceInr)}</dd>
            </>
          )}
        </dl>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Total</span>
          <span style={{ marginLeft: 'auto', fontSize: 26, fontWeight: 800, letterSpacing: '-.01em' }}>
            {priceInr === null ? '—' : rupees(priceInr)}
          </span>
        </div>
        {/* THE MAKING CHARGE IS NOT INVENTED. We have the owner's stone prices
            and no metalwork prices at all, so the page says what it is quoting
            for and what it is not. A total with a guessed number inside it is
            worse than a total that stops where the data does. */}
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>
          {worn === 'loose'
            ? 'The stone, certified and unset. There is nothing else to pay us — setting it is between you and your jeweller.'
            : 'Stone and metal, made up and delivered. Metal is priced at today’s rate; if it has moved by the time the piece is made, the jeweller will say so before starting.'}
        </p>

        {/* TWO WAYS OUT AND BOTH LOCK THE DESIGN. Nothing is charged here —
            this page decides WHAT is being made, and the checkout decides what
            is being paid for. "Commission" is the same lock with the checkout
            on the end of it, so somebody who only wants this one stone never
            sees a cart they did not ask for, and somebody choosing three does
            not pay three times. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
          <Button variant="accent" disabled={priceInr === null || lock.isPending}
            onClick={() => lock.mutate(lockPayload, { onSuccess: () => navigate('/astrology/gem-checkout') })}>
            {lock.isPending ? 'Locking…' : `Commission this stone · ${priceInr === null ? '—' : rupees(priceInr)}`}
          </Button>
          <Button variant="line" disabled={priceInr === null || lock.isPending}
            onClick={() => lock.mutate(lockPayload, { onSuccess: () => navigate('/astrology/gemstones') })}>
            Lock this and see the others
          </Button>
          {lock.isError && (
            <span style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>{payError(lock.error)}</span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 12 }}>
          Locking costs nothing. It holds this design in your checkout, priced at the day&rsquo;s rate,
          until you pay or remove it.
        </p>
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 14 }}>{data.disclaimer}</p>
      </Card>
    </div>
  );
}
