import { useState, type CSSProperties } from 'react';
import { Button, Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useChooseDailyCard, useDrawTarot, useTarotDaily, useTarotHistory, useTarotSpreads } from '../hooks';
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
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#a4551f' }}>
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

/** A whole reading: its cards, then the line that ties them together. */
function ReadingView({ reading }: { reading: TarotReading }) {
  const wide = reading.cards.length > 3;
  return (
    <>
      <div style={{
        display: 'grid', gap: 14, marginBottom: 18,
        gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 210 : 240}px, 1fr))`,
      }}>
        {reading.cards.map((c, i) => <CardFace key={c.position} card={c} index={i} />)}
      </div>
      <Card style={{ padding: '18px 22px', marginBottom: 16 }}>
        <h4 style={{ fontFamily: 'var(--serif)', fontSize: 16, marginBottom: 8 }}>Reading the spread</h4>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>{reading.summary}</p>
      </Card>
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
    <Card className="rise" style={{ padding: '24px 26px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, margin: 0 }}>Card of the Day</h3>
        <span className="muted" style={{ fontSize: 12.5 }}>Free · one card, yours until midnight</span>
      </div>

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
          {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 14 }}>{error}</p>}
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

  const options = spreads.data?.spreads ?? [];
  const chosen = options.find((o) => o.kind === kind);

  const submit = () => {
    setError(null);
    draw.mutate({ kind, question: question.trim() }, {
      onSuccess: (res) => { setResult(res); setQuestion(''); },
      onError: (e) => {
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'Something went wrong — you have not been charged.');
      },
    });
  };

  return (
    <div>
      <AstroHeader
        title="Tarot"
        lede="A card a day, free — or ask a question and draw a full spread. Every reading is reproducible: the same draw can be regenerated from its seed." />

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
            <button key={o.kind} type="button" onClick={() => setKind(o.kind as 'three' | 'celtic')}
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
          <Button variant="accent" disabled={draw.isPending || question.trim().length < 5} onClick={submit}>
            {draw.isPending ? 'Drawing…' : `Draw ${chosen?.name ?? 'spread'}${chosen?.priceInr ? ` · ₹${chosen.priceInr}` : ''}`}
          </Button>
          <span className="muted" style={{ fontSize: 12 }}>{question.trim().length}/300</span>
        </div>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Card>

      {result && (
        <Card className="rise" style={{ padding: '24px 26px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, margin: 0 }}>{result.spreadName}</h3>
            <span className="muted" style={{ fontSize: 12.5 }}>just drawn</span>
          </div>
          {result.question && <p style={{ fontSize: 14, fontStyle: 'italic', margin: '6px 0 16px' }}>“{result.question}”</p>}
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
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
