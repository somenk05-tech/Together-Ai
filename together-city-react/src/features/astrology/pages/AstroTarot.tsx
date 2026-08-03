import { useState, type CSSProperties } from 'react';
import { Button, Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useChooseDailyCard, useDeleteTarotReading, useDrawTarot, useTarotDaily, useTarotHistory, useTarotSpreads } from '../hooks';
import { AstroHeader } from '../shared';
import type { TarotDrawnCard, TarotReading } from '../api';
import { artFor } from '../cardArt';

/**
 * Tab 04 — Tarot. Card of the Day is free; the Past/Present/Future and Celtic
 * Cross spreads are drawn against a question and charged to the city wallet.
 *
 * Deliberately NOT gated behind NeedsProfileCard, unlike the other three tabs.
 * Tarot needs no birth time, no place and no ascendant — gating it on birth
 * details would invent a requirement the practice doesn't have.
 */

const SUIT_GLYPH: Record<string, string> = {
  wands: '🜂', cups: '🜄', swords: '🜁', pentacles: '🜃',
};

/**
 * One drawn card.
 *
 * ILLUSTRATED WHERE WE HAVE THE ART AND TYPOGRAPHIC WHERE WE DO NOT. The 22
 * Major Arcana have paintings; the 56 Minors do not yet, and asking cardArt.ts
 * rather than assuming is the difference between a page of cards and a page of
 * broken image icons. The fallback is the face this component always drew, so a
 * Minor reads as a deliberate design rather than as a fault — see cardArt.ts.
 *
 * A reversed card is rotated, which is what reversed MEANS. The name and
 * keywords underneath stay the right way up, because they are a caption on the
 * card and not part of it.
 */
function CardFace({ card, index }: { card: TarotDrawnCard; index: number }) {
  const glyph = card.arcana === 'major' ? '✦' : SUIT_GLYPH[card.suit ?? ''] ?? '✦';
  const art = artFor(card.cardId);
  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 16, background: 'var(--card)',
      boxShadow: 'var(--shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
        background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {index + 1} · {card.position}
        </span>
        {card.reversed && (
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--warn-ink)' }}>
            Reversed
          </span>
        )}
      </div>
      <div style={{ padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {art ? (
          <img className="tarot-art" src={art} alt=""
            loading="lazy" decoding="async"
            style={{ transform: card.reversed ? 'rotate(180deg)' : 'none' }} />
        ) : (
          <div style={{
            fontSize: 30, lineHeight: 1, marginBottom: 10, textAlign: 'center',
            transform: card.reversed ? 'rotate(180deg)' : 'none', transition: 'transform .3s',
          }}>{glyph}</div>
        )}
        <h4 style={{ fontFamily: 'var(--serif)', fontSize: 17, textAlign: 'center', margin: '0 0 10px' }}>{card.name}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
          {card.keywords.map((k) => <Tag key={k}>{k}</Tag>)}
        </div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>{card.reading}</p>
      </div>
    </div>
  );
}

/**
 * ONE CARD IS NOT A ONE-ITEM GRID.
 *
 * `repeat(auto-fill, minmax(240px, 1fr))` with a single child fills the first
 * column and leaves every other one empty — on a wide screen that is a card in
 * the top-left corner and three-quarters of a panel of white. The grid is right
 * for three cards and for ten; it is wrong for one, and the fix is a different
 * layout rather than a narrower grid.
 *
 * So a solo card is laid out as a card BESIDE its reading: the painting at a
 * size worth looking at, and the name, keywords and prose in the space the grid
 * was wasting. It stacks under 640px, where there is no space to waste.
 */
function SoloCard({ card }: { card: TarotDrawnCard }) {
  const glyph = card.arcana === 'major' ? '✦' : SUIT_GLYPH[card.suit ?? ''] ?? '✦';
  const art = artFor(card.cardId);
  return (
    <div className="tarot-solo">
      <div className="tarot-solo-art">
        {art ? (
          <img src={art} alt="" loading="lazy" decoding="async"
            style={{ transform: card.reversed ? 'rotate(180deg)' : 'none' }} />
        ) : (
          <div className="tarot-solo-glyph" style={{ transform: card.reversed ? 'rotate(180deg)' : 'none' }}>
            {glyph}
          </div>
        )}
      </div>
      <div className="tarot-solo-body">
        <p className="tarot-solo-eyebrow">
          {card.position}
          {card.reversed && <span className="tarot-solo-rev">Reversed</span>}
        </p>
        <h3 className="tarot-solo-name">{card.name}</h3>
        <div className="tarot-solo-keys">
          {card.keywords.map((k) => <Tag key={k}>{k}</Tag>)}
        </div>
        <p className="tarot-solo-read">{card.reading}</p>
      </div>
    </div>
  );
}

/**
 * A whole reading: its cards, and — only when there is one — the line that ties
 * them together.
 *
 * THE SUMMARY IS NOT ALWAYS THERE, AND THE BOX MUST NOT BE EITHER. A single
 * card has no spread to draw together: every line the server can write is about
 * how several cards sit with each other. So a Card of the Day used to render
 * the heading "Reading the spread" over one sentence that said nothing, sitting
 * directly beneath the card's own reading, which had already said it.
 *
 * Checked on the TEXT rather than on the card count, so every daily reading
 * already saved — with that sentence baked into its stored JSON — loses the box
 * too.
 */
function ReadingView({ reading }: { reading: TarotReading }) {
  const summary = (reading.summary ?? '').trim();
  if (reading.cards.length === 1) return <SoloCard card={reading.cards[0]} />;

  const wide = reading.cards.length > 3;
  return (
    <>
      <div style={{
        display: 'grid', gap: 14, marginBottom: 18,
        gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 210 : 240}px, 1fr))`,
      }}>
        {reading.cards.map((c, i) => <CardFace key={c.position} card={c} index={i} />)}
      </div>
      {summary && (
        <Card style={{ padding: '18px 22px', marginBottom: 16 }}>
          <h4 style={{ fontFamily: 'var(--serif)', fontSize: 16, marginBottom: 8 }}>Reading the spread</h4>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{summary}</p>
        </Card>
      )}
    </>
  );
}

/** Shown under every reading. Never conditional — see DISCLAIMER on the API. */
function Disclaimer({ text }: { text: string }) {
  return (
    <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
      {text}
    </p>
  );
}

/**
 * Card of the Day — seven face-down cards, and the one you turn is yours.
 *
 * THE CHOICE IS REAL, which is the only reason this is a fan and not a
 * flourish. The position is part of the seed on the server, so the seven backs
 * are seven different cards; nothing is dealt or stored until one is turned;
 * and the first turn is written with `update: {}`, so it cannot be retaken. A
 * spread you can pick from that always gives the same card is theatre, and the
 * citizen finds out by reloading.
 *
 * The backs are drawn in CSS rather than shipped as art — the same reason
 * CardFace is typographic: inventing card illustrations we have no licence for
 * would be worse than showing none. If real designs arrive, `.tarot-back` is
 * one rule and one image away from using them.
 */
function DailyCard() {
  const daily = useTarotDaily();
  const choose = useChooseDailyCard();
  const [turning, setTurning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = daily.data;

  const pick = (position: number) => {
    if (choose.isPending) return;
    setError(null);
    setTurning(position);
    choose.mutate(position, {
      onError: (e) => {
        setTurning(null);
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'The card would not turn. Try again in a moment.');
      },
    });
  };

  return (
    // The frame is a mat, not a container for text — the card inside keeps the
    // app's ordinary light surface, so nothing here has to be re-coloured for a
    // dark ground and nothing can quietly become unreadable.
    <>
    {/* NO FRAME AROUND THE CARD, BECAUSE THE PAGE IS THE FRAME. This used to sit
        inside its own celestial border; the whole surface now carries one, and
        a frame inside a frame is two ornaments arguing. */}
    <h3 className="astro-frame-heading">Card of the Day</h3>
    <p className="astro-frame-note">Free · one card, yours until midnight</p>
    <div style={{ marginBottom: 22 }}>
      <Card className="rise" style={{ padding: '26px 28px', marginBottom: 0 }}>

      {daily.isLoading && <Spinner label="Laying out the cards…" />}
      {daily.isError && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          We couldn&rsquo;t lay out today&rsquo;s cards. This isn&rsquo;t a message that you&rsquo;ve
          already drawn &mdash; only that we couldn&rsquo;t check. Reload to try again.
        </p>
      )}

      {d && !d.chosen && (
        <>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 20px', maxWidth: '54ch' }}>
            Seven cards, face down. Take your time and turn one &mdash; whichever you choose is the
            card for your day, and it stays yours until midnight.
          </p>
          <div className="tarot-fan" role="group" aria-label="Seven face-down cards">
            {Array.from({ length: d.fan }, (_, i) => (
              <button key={i} type="button" className="tarot-back"
                style={{ '--i': i, '--n': d.fan } as CSSProperties}
                disabled={choose.isPending}
                aria-label={`Turn card ${i + 1} of ${d.fan}`}
                onClick={() => pick(i)}>
                <span className="tarot-back-face" aria-hidden>
                  <span className="tarot-back-mark" />
                </span>
              </button>
            ))}
          </div>
          {choose.isPending && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
              Turning card {(turning ?? 0) + 1}…
            </p>
          )}
          {error && <p style={{ color: 'var(--danger-ink)', fontSize: 13, marginTop: 14 }}>{error}</p>}
          <Disclaimer text={d.disclaimer} />
        </>
      )}

      {d?.chosen && (
        <>
          {typeof d.position === 'number' && (
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
              You turned card {d.position + 1}.
            </p>
          )}
          <div className="tarot-turned">
            <ReadingView reading={d} />
          </div>
          <Disclaimer text={d.disclaimer} />
        </>
      )}
      </Card>
    </div>
    </>
  );
}

export function AstroTarot() {
  const spreads = useTarotSpreads();
  const history = useTarotHistory();
  const draw = useDrawTarot();

  const [kind, setKind] = useState<'three' | 'celtic'>('three');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TarotReading | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeReading = useDeleteTarotReading();
  /**
   * The cards turned so far, in the order they were turned, and whether the
   * table is out.
   *
   * NOTHING IS DRAWN UNTIL THE LAST ONE. The spread used to be dealt the moment
   * the button was pressed; laying backs in front of a reading that has already
   * happened is theatre, and this state is what keeps it from being that — the
   * request does not leave until `picks.length` reaches the spread's size, and
   * the picks go with it, so which backs were turned is what decides which cards
   * come out.
   */
  const [picks, setPicks] = useState<number[]>([]);
  const [laid, setLaid] = useState(false);

  const options = spreads.data?.spreads ?? [];
  const chosen = options.find((o) => o.kind === kind);
  const need = chosen?.cards ?? 3;
  const fan = chosen?.fan ?? 12;

  /** Put the table out. Still nothing dealt, nothing charged. */
  const lay = () => {
    setError(null);
    setResult(null);
    setPicks([]);
    setLaid(true);
  };

  const pickSpread = (k: 'three' | 'celtic') => {
    // A different spread is a different table. Clearing is honest rather than
    // destructive: no cards have been dealt, so there is nothing to lose.
    setKind(k);
    setPicks([]);
    setLaid(false);
  };

  const turn = (i: number) => {
    if (draw.isPending || picks.includes(i) || picks.length >= need) return;
    const next = [...picks, i];
    setPicks(next);
    if (next.length < need) return;

    setError(null);
    draw.mutate({ kind, question: question.trim(), picks: next }, {
      onSuccess: (res) => { setResult(res); setLaid(false); setPicks([]); setQuestion(''); },
      onError: (e) => {
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'Something went wrong — you have not been charged.');
      },
    });
  };

  return (
    /**
     * THE WHOLE PAGE IS THE INSIDE OF A CARD.
     *
     * `.tarot-night` re-points the design system's own variables — --card,
     * --line, --ink, --paper, --muted — rather than restyling anything. Every
     * shared component inside it (Card, Tag, Button, EmptyState, Spinner)
     * already reads those, so they follow the theme without one of them being
     * touched. That is what the variables are for, and it is why this is a
     * class on a wrapper and not a second copy of the component library.
     */
    <div className="tarot-night">
      <div className="tarot-frame" aria-hidden />
      <AstroHeader
        title="Tarot"
        lede="A card a day, free — or ask a question and turn a full spread yourself. Nothing is dealt until you have turned every card. Every reading is reproducible: the same draw can be regenerated from its seed." />

      {/* ── Card of the Day (free) ── */}
      <DailyCard />

      {/* ── Paid spreads ── */}
      <Card className="rise" style={{ padding: '24px 26px', marginBottom: 22 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 4 }}>Ask the Cards</h3>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>
          Bring a real question — the cards answer situations better than they answer yes or no.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {options.filter((o) => o.kind !== 'daily').map((o) => (
            <button key={o.kind} type="button" onClick={() => pickSpread(o.kind as 'three' | 'celtic')}
              style={{
                flex: '1 1 220px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                padding: '14px 16px', borderRadius: 14, background: kind === o.kind ? 'var(--accent-soft)' : 'var(--paper)',
                border: `1.5px solid ${kind === o.kind ? 'var(--accent)' : 'var(--line)'}`,
              }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 3 }}>{o.name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{o.cards} cards · {o.priceInr ? `₹${o.priceInr}` : 'Free'}</div>
            </button>
          ))}
        </div>

        {!laid && (
          <>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should I be paying attention to in my work right now?"
              rows={3}
              maxLength={300}
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12,
                fontFamily: 'inherit', fontSize: 14, resize: 'vertical', marginBottom: 10,
              }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* The button lays the table out. It does not draw, and it does
                  not charge — that happens when the last card is turned, which
                  is the only moment there is a reading to charge for. */}
              <Button variant="accent" disabled={question.trim().length < 5} onClick={lay}>
                Lay out the cards →
              </Button>
              <span className="muted" style={{ fontSize: 12 }}>{question.trim().length}/300</span>
            </div>
          </>
        )}

        {laid && (
          <>
            <p style={{ fontSize: 14, fontStyle: 'italic', margin: '0 0 4px' }}>“{question.trim()}”</p>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 4px', maxWidth: '58ch' }}>
              {fan} cards, face down. Turn {need} of them &mdash; the first fills{' '}
              {chosen?.name === 'The Celtic Cross' ? 'The Heart' : 'Past'}, and the rest follow in the
              order you turn them. Nothing is drawn until the last one.
            </p>

            <div className="tarot-table" role="group"
              aria-label={`${fan} face-down cards — turn ${need}`}>
              {Array.from({ length: fan }, (_, i) => {
                const at = picks.indexOf(i);
                const turned = at >= 0;
                return (
                  <button key={i} type="button"
                    className={`tarot-pick${turned ? ' is-turned' : ''}`}
                    disabled={draw.isPending || turned}
                    aria-pressed={turned}
                    aria-label={turned
                      ? `Card ${i + 1}, turned into position ${at + 1}`
                      : `Turn card ${i + 1} of ${fan}`}
                    onClick={() => turn(i)}>
                    <span className="tarot-back-face" aria-hidden>
                      {turned
                        ? <span className="tarot-pick-no">{at + 1}</span>
                        : <span className="tarot-back-mark" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {draw.isPending
                  ? 'Reading the cards…'
                  : `${picks.length} of ${need} turned${chosen?.priceInr ? ` · ₹${chosen.priceInr} when the last one turns` : ''}`}
              </span>
              {!draw.isPending && (
                // Free, and said so: nothing has been dealt, so starting again
                // costs nothing and takes nothing away.
                <button type="button" onClick={() => { setPicks([]); setLaid(false); setError(null); }}
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--accent-ink)' }}>
                  Start over &mdash; nothing has been drawn
                </button>
              )}
            </div>
          </>
        )}
        {error && <p style={{ color: 'var(--danger-ink)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Card>

      {result && (
        <Card className="rise" style={{ padding: '24px 26px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, margin: 0 }}>{result.spreadName}</h3>
            <span className="muted" style={{ fontSize: 12.5 }}>just drawn</span>
          </div>
          {result.question && <p style={{ fontSize: 14, fontStyle: 'italic', margin: '6px 0 6px' }}>“{result.question}”</p>}
          {result.picks && result.picks.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px' }}>
              You turned cards {result.picks.map((p) => p + 1).join(', ')}.
            </p>
          )}
          <ReadingView reading={result} />
          <Disclaimer text={result.disclaimer} />
        </Card>
      )}

      {/* ── Archive ── */}
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, margin: '26px 0 12px' }}>My Readings</h3>
      {history.isLoading && <Spinner label="Loading your readings…" />}
      {history.data?.length === 0 && (
        <EmptyState icon="🂠" title="No readings yet" hint="Your Card of the Day and every spread you draw are kept here." />
      )}
      {(history.data ?? []).map((h) => (
        <Card key={h.id} style={{ padding: '16px 20px', marginBottom: 10 }}>
          <button type="button" onClick={() => setOpenId(openId === h.id ? null : h.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{h.spreadName}</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {new Date(h.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {h.question ? ` · “${h.question}”` : ''}
                {h.priceInr ? ` · ₹${h.priceInr}` : ' · free'}
              </span>
            </span>
            <span className="muted" style={{ fontSize: 12 }}>{openId === h.id ? 'Hide' : 'Open'}</span>
          </button>
          {openId === h.id && (
            <div style={{ marginTop: 16 }}>
              <ReadingView reading={{ ...h, kind: h.kind as TarotReading['kind'], question: h.question ?? undefined }} />
              <Disclaimer text={h.disclaimer} />

              {/* Two steps, in place. A browser confirm() blocks every later
                  interaction if it is ever left open, and a modal over a
                  reading somebody is part-way through is the wrong shape for a
                  decision this small. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
                {confirmId === h.id ? (
                  <>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Delete this reading permanently? It is not recoverable.
                    </span>
                    <button type="button" disabled={removeReading.isPending}
                      onClick={() => removeReading.mutate(h.id, {
                        onSuccess: () => { setConfirmId(null); setOpenId(null); setDeleteError(null); },
                        onError: (e) => {
                          const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
                          setDeleteError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'It could not be deleted just now — it is still here.');
                        },
                      })}
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>
                      {removeReading.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button type="button" onClick={() => { setConfirmId(null); setDeleteError(null); }}
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--accent-ink)' }}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setConfirmId(h.id); setDeleteError(null); }}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--accent-ink)' }}>
                    Delete this reading
                  </button>
                )}
              </div>
              {/* The server's own sentence, not ours — today's Card of the Day
                  is refused, and the reason is worth reading. */}
              {deleteError && confirmId === h.id && (
                <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }} role="alert">{deleteError}</p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
