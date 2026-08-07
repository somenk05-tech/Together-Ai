import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Spinner, EmptyState } from '@/components/ui';
import { MenuView } from '../MenuView';
import { Gallery, Reviews } from '../ListingPanel';
import { ReviewBox } from '../ReviewBox';
import {
  useService, useEnquire, useToggleRegular, useRegulars, useOffersToday, useReviews, useMyServices,
  rupees, humanDistance, stars,
} from '../api';

/**
 * ONE BUSINESS, ITS OWN PAGE — AND IT READS LIKE THEIR SITE, NOT LIKE A ROW.
 *
 * A directory card is a summary. This is the thing it summarises: the page a
 * shopkeeper would send somebody who asked "where can I see what you do?" So it
 * is built the way a small business site is built — one large photograph with
 * the name on it, the handful of facts that decide anything laid along the foot
 * of it, and section headings that name themselves in two weights.
 *
 * It is a real route, so it can be linked, bookmarked, sent to a friend and
 * reopened tomorrow. That is most of what "a page of their own" means and none
 * of it works from a panel that exists only while a list is scrolled to the
 * right place.
 *
 * THE PHOTOGRAPH IS THE DESIGN. There is no invented colour, no decorative
 * gradient, no stock furniture — a page that dresses up thin content is a page
 * that looks the same for a business that filled the form in and one that did
 * not. Every fact cell, every section, appears only when the owner gave it
 * something to show. A shop with one line of About gets a short page, honestly.
 *
 * The one thing it never becomes is a shopfront that takes money. No basket, no
 * payment, no confirmed time; picking items writes a message, and every control
 * that could be mistaken for an order says what it actually does.
 */
const section: React.CSSProperties = { marginTop: 30 };

/** "About / Sharma Plumbing" — light word names the section, heavy word names
 *  the thing. One heading doing two jobs, which is why it can be this large. */
function Head({ lite, bold }: { lite: string; bold: string }) {
  return (
    <h2 className="biz-h"><span className="lite">{lite} </span><span className="bold">{bold}</span></h2>
  );
}

export function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const q = useService(id);
  const enquire = useEnquire();
  const keep = useToggleRegular();
  const regulars = useRegulars();
  const offers = useOffersToday();
  const mineList = useMyServices();
  const reviews = useReviews(id);
  const [err, setErr] = useState<string | null>(null);

  if (q.isLoading) return <Spinner label="Opening the page…" />;
  // A page that cannot be loaded says so. Rendering an empty shell would tell
  // the citizen this business has nothing on it — a claim about somebody else's
  // shop that was never checked.
  if (q.isError || !q.data) {
    return (
      <EmptyState title="That business page could not be opened"
        hint="It may have closed, or the link may be old. The directory is still there."
        action={<Button variant="line" onClick={() => nav('/services/browse')}>Back to Find a service</Button>} />
    );
  }

  const s = q.data;
  const saved = (regulars.data?.items ?? []).some((r) => r.id === s.id);
  const running = (offers.data?.items ?? []).filter((o) => o.listingId === s.id);
  const cover = s.photos[0]?.url;
  /** Your own listing, if this page is yours. Nothing here is shown to anybody else. */
  const mine = (mineList.data ?? []).find((l) => l.id === s.id) ?? null;
  const rating = reviews.data?.rating ?? null;
  const count = reviews.data?.count ?? 0;

  const chat = () => {
    setErr(null);
    enquire.mutate({ id: s.id }, {
      // Into the room, not the corridor. `enquire` is idempotent — it returns
      // the thread that already exists rather than opening a second one — so
      // this is "carry on where we left off" as often as it is "start".
      onSuccess: (t) => nav(`/services/messages/${t.id}`),
      onError: () => setErr('That conversation could not be opened just now. Try again in a moment.'),
    });
  };

  /** Only the cells with an answer. An empty "from ₹—" is a business admitting
   *  in its own shopfront that it did not finish the form. */
  const facts: Array<{ k: string; v: string }> = [];
  if (count > 0) {
    facts.push({
      k: 'What people say',
      v: rating != null ? `${stars(Math.round(rating))}  ${rating} from ${count} reviews`
        : `${count} ${count === 1 ? 'review' : 'reviews'} — too few for an average`,
    });
  }
  facts.push({
    k: s.distanceKm != null ? 'How far' : 'Where',
    v: s.distanceKm != null
      ? `${humanDistance(s.distanceKm)} away · ${s.areas[0] ?? s.city}`
      : (s.areas.length ? s.areas.join(' · ') : s.city),
  });
  if (s.priceFrom != null) facts.push({ k: 'Starting from', v: rupees(s.priceFrom) });

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/services/browse" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
          ← All local services
        </Link>
      </div>

      <div className={`biz-hero${cover ? '' : ' is-bare'}`}>
        {cover
          ? <img className="biz-hero-img" src={cover} alt={`${s.businessName}, photographed by them`} />
          : <div className="biz-hero-img" aria-hidden />}
        <div className="biz-hero-scrim" aria-hidden />
        <div className="biz-hero-inner">
          {/* ONE CALL TO ACTION, AND IT IS NOT UP HERE.
              A pill in the corner of the photograph and a button under it said
              the same thing twice, and a citizen who reads both wonders whether
              they do different things. The hero carries the name; the row below
              carries the decision. */}
          <div className="biz-hero-top">
            <span className="biz-mark">{s.businessName}</span>
          </div>
          <div>
            <p className="biz-hero-eyebrow">{s.categoryLabel}</p>
            <h1 className="biz-hero-title">{s.businessName}</h1>
            <div className="biz-facts">
              {facts.map((f) => (
                <div className="biz-fact" key={f.k}>
                  <div className="biz-fact-k">{f.k}</div>
                  <div className="biz-fact-v">{f.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
        <Button variant="accent" disabled={enquire.isPending} onClick={chat}>
          {enquire.isPending ? 'Opening…' : 'Chat with this business'}
        </Button>
        {/* Published numbers only. A tel: link on a number a business asked to
            keep private is the breach, not the button. */}
        {s.phone && (
          <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} style={{ textDecoration: 'none' }}>
            <Button variant="line">📞 Call {s.phone}</Button>
          </a>
        )}
        <Button variant="line" disabled={keep.isPending} onClick={() => keep.mutate({ id: s.id, saved })}>
          {saved ? '✓ Kept' : 'Keep'}
        </Button>
      </div>
      {/*
        THE TRADE, STATED BEFORE IT IS MADE.

        A phone call carries a number. This hub's whole promise is that a
        citizen can approach a business without being identifiable, and dialling
        is the moment that ends — not because anything leaks, but because that
        is what a telephone is. Saying so at the button is the difference
        between a citizen choosing to be known and finding out afterwards.
      */}
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0', maxWidth: '68ch' }}>
        Messaging keeps you anonymous — they see you as a neighbour, and it never reaches your
        Chats.{s.phone && ' Ringing them shows them your number, the way any call does.'}
      </p>
      {err && <p style={{ color: 'var(--danger-ink)', fontSize: 13, marginTop: 8 }} role="alert">{err}</p>}

      {/*
        THE MISSING LINK BETWEEN WANTING A CALL BUTTON AND HAVING ONE.

        The button is not absent because it was never built; it is absent
        because this business has not published a number, which is the correct
        default and the promise the listing form made. Only the owner sees this
        line, and only when they have a number that is switched off — anybody
        else seeing it would be told a phone number exists, which is most of
        what withholding it was for.
      */}
      {mine && mine.phone && !mine.phonePublic && (
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
          Your number is on file but private, so nobody can ring you.{' '}
          <Link to={`/services/${s.id}/edit`} style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>
            Turn on “Show this number on my page”
          </Link>{' '}and a Call button appears here for everyone.
        </p>
      )}

      {/*
        AT A GLANCE.

        The schema's own answers, in the schema's own words. A restaurant shows
        cuisines and cost for two; a plumber shows emergency call-outs and a
        visiting charge; neither screen knows what the other's fields are
        called, because the labels travel with the values.
      */}
      {s.details.length > 0 && (
        <div style={section}>
          <Head lite="At a" bold="glance" />
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, margin: 0 }}>
            {s.details.map((d) => (
              <div key={d.label}>
                <dt className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{d.label}</dt>
                <dd style={{ fontSize: 14, margin: '3px 0 0' }}>{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {s.about && (
        <div style={section} className="biz-split">
          <Head lite="About" bold={s.businessName} />
          <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{s.about}</p>
        </div>
      )}

      {running.length > 0 && (
        <div style={section}>
          <Head lite="On" bold="today" />
          <div style={{ display: 'grid', gap: 8 }}>
            {running.map((o) => (
              <Card key={o.id} style={{ padding: '13px 17px' }}>
                <strong style={{ fontSize: 14 }}>{o.title}</strong>
                {o.detail && <p className="muted" style={{ fontSize: 13, margin: '3px 0 0' }}>{o.detail}</p>}
              </Card>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            An offer is what the business says it is running. Ask them before you set out.
          </p>
        </div>
      )}

      {/* Menu for a restaurant, price list for everyone else — MenuView takes
          its words from the category group, and renders nothing at all when the
          business has not published one. */}
      {/*
        SECTIONS DECIDE WHAT TO ASK FOR, NEVER WHAT TO HIDE.
        
        This was gated on the type declaring a menu, and it hid sixty-two
        published prices from a salon whose owner had not yet picked a type —
        the listing predates the schema, so it declared nothing, so the page
        showed nothing. A business that took the trouble to publish a price
        list has said what it wants shown, and no schema of ours outranks that.
        MenuView renders nothing of its own accord when there is nothing.
      */}
      <MenuView listingId={s.id} group={s.categoryGroup} onSent={(threadId) => nav(`/services/messages/${threadId}`)} />

      {/* Photographs on a dark ground, which is where photographs look their
          best and the only reason this band exists. */}
      {/* Same rule: photographs the owner uploaded are shown because they
          exist, not because a type remembered to ask for them. */}
      {s.photos.length > 1 && (
        <div style={section} className="biz-dark">
          <Head lite="Their" bold="place" />
          <Gallery photos={s.photos} name={s.businessName} />
        </div>
      )}

      <Reviews listingId={s.id} />
      {/* Writing one lives here now, beside the ones already written, which is
          where a citizen is actually deciding. It appears only for somebody who
          has spoken to this business — the server decides that, not this
          screen. */}
      <ReviewBox listingId={s.id} />

      {s.slug && (
        <div style={section}>
          <Head lite="Their" bold="address" />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            togethercity.app/services/<strong style={{ color: 'var(--ink)' }}>{s.slug}</strong>
          </p>
        </div>
      )}

      {(s.lat != null && s.lng != null) && (
        <div style={section}>
          <Head lite="Where" bold="they are" />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Pinned at {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            {s.radiusKm != null && ` · travels about ${s.radiusKm} km`}
          </p>
        </div>
      )}

      <div style={{ ...section, borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 8 }}>
        <Button variant="accent" disabled={enquire.isPending} onClick={chat}>
          {enquire.isPending ? 'Opening…' : `Chat with ${s.businessName}`}
        </Button>
      </div>
    </div>
  );
}
