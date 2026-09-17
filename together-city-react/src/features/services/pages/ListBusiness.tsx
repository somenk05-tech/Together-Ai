import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { ListingForm } from '../ListingForm';
import { serviceHref, useCreateService, type MyServiceCard } from '../api';
import { useUnderstandBusiness, type Understanding } from '../understand.api';

/**
 * ── CREATE YOUR BUSINESS ON TOGETHER CITY (owner, 17 Sep) ────────────────────
 *
 * "Don't ask vendors to select templates. Together City should be: tell us
 * about your business → Together City understands it → your business is
 * created."
 *
 * Three moments on one page.
 *
 *   1. WHAT DO YOU DO?  One box. The owner types the way they would say it —
 *      "I run a café in Bandra" — and presses Continue. The sentence goes to
 *      POST /services/understand, which reads it (rules first, the model only
 *      when the rules are unsure) and answers with the trade, the type and
 *      the engine. Nothing is stored.
 *
 *   2. GREAT. LET'S CREATE YOUR CAFÉ.  The reading is said back in one line,
 *      with the runner-up trades as one-press corrections, and the same
 *      ListingForm the edit screen uses opens UNDERNEATH it, pre-filled —
 *      trade, type, city and locality already answered, the three dropdowns
 *      folded away behind "Change". From here on it is the form that has
 *      always existed: the type's own questions and nobody else's, the pin,
 *      the reach, the photos. A doctor sees a consultation fee; a café sees
 *      seats and cost for two; neither sees the other's.
 *
 *   3. YOUR CAFÉ IS READY.  The address it is live at, a door to see it as a
 *      customer would, and a door to the one thing it still needs — its menu,
 *      its stock list, its rates — in the catalogue's own word.
 *
 * WHAT WAS DELIBERATELY NOT BUILT: a second form. The questions live in
 * ListingForm and the schema they are generated from lives on the server; a
 * reading only decides which of those questions are asked first. Two copies
 * of the form would drift within a month, which is the reason the 24 Aug
 * comment on this page gave for not having two then.
 */
type Phase = 'ask' | 'build' | 'ready';

/** Said as chips under the box: the owner's six trades, in a citizen's words. */
const EXAMPLES = [
  'I run a café in Bandra',
  'Orthopaedic doctor with a clinic in Andheri',
  "I have a women's salon",
  'I repair cars',
  'I sell handmade jewellery',
  'Personal trainer, I come to you',
];

export function ListBusiness() {
  const nav = useNavigate();
  const create = useCreateService();
  const understand = useUnderstandBusiness();
  const [phase, setPhase] = useState<Phase>('ask');
  const [text, setText] = useState('');
  const [reading, setReading] = useState<Understanding | null>(null);
  /* The trade and type the form is being built for. They start as the
     reading's and move when the owner presses an alternative or opens the
     dropdowns; the reading itself is never rewritten, so "Start again" and
     the headline keep saying what was read. */
  const [trade, setTrade] = useState<{ categoryKey: string; typeKey: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [made, setMade] = useState<MyServiceCard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = () => {
    setErr(null);
    understand.mutate(text.trim(), {
      onSuccess: (r) => {
        setReading(r);
        setTrade({ categoryKey: r.categoryKey, typeKey: r.typeKey });
        // A reading nobody could make opens the dropdowns rather than a
        // headline promising a business it has not understood.
        setChanging(r.confidence === 'unsure');
        setPhase('build');
      },
      onError: () => setErr('Could not read that just now. Try once more, or pick your trade from the list.'),
    });
  };

  /* The list, without a sentence: the same form, nothing pre-filled, every
     dropdown open. The road that existed before this page had a front door. */
  const skip = () => {
    setReading(null);
    setTrade(null);
    setChanging(true);
    setPhase('build');
  };

  if (phase === 'ready' && made) {
    const noun = reading?.noun ?? 'business';
    const url = `togethercity.app${serviceHref(made)}`;
    return (
      <div className="cyb">
        <div className="eyebrow">Local Market</div>
        <h1 className="cyb-h">Your {noun} is ready.</h1>
        <Card className="cyb-card">
          <p className="cyb-lead">It is live now, at <b className="cyb-url">{url}</b> — the address people can type straight in.</p>
          {reading && <p className="muted cyb-say-what">{reading.engine.builds}</p>}
          <div className="cyb-row">
            <Link to={serviceHref(made)}><Button variant="accent">See it as customers do</Button></Link>
            <Link to="/services/mine">
              <Button variant="line">
                {made.catalogue.kind === 'none' ? 'Add a price list' : `Add your ${made.catalogue.title.toLowerCase()}`}
              </Button>
            </Link>
            <Link to={`/services/${made.id}/edit`}><Button variant="line">Edit details</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === 'build') {
    const unsure = !reading || reading.confidence === 'unsure';
    const headline = !reading
      ? "Let's create your business."
      : unsure
        ? "Let's create your business."
        : reading.confidence === 'likely'
          ? `Is it a ${reading.noun}? Let's create it.`
          : `Great. Let's create your ${reading.noun}.`;
    return (
      <div className="cyb">
        <div className="eyebrow">Local Market</div>
        <h1 className="cyb-h">{headline}</h1>

        {reading && !unsure && (
          <Card className="cyb-read">
            <div className="cyb-read-k">{reading.engine.label}</div>
            <div className="cyb-read-v"><b>{reading.categoryLabel}</b> · {reading.typeLabel}</div>
            <p className="cyb-read-say">{reading.engine.builds}</p>
            {/* ONE PRESS TO CORRECT IT. The runner-up trades the reading
                considered, as keys; anything else opens the dropdowns in the
                form below. The reading's own trade is never among them. */}
            <div className="cyb-eg" role="group" aria-label="Not right? Choose another">
              <span className="muted cyb-eg-lead">Not right?</span>
              {reading.alternatives.map((a) => (
                <button key={a.categoryKey} type="button" className="cyb-eg-k"
                  aria-pressed={trade?.categoryKey === a.categoryKey}
                  onClick={() => { setTrade({ categoryKey: a.categoryKey, typeKey: a.typeKey }); setChanging(false); }}>
                  {a.label}
                </button>
              ))}
              <button type="button" className="cyb-link" onClick={() => setChanging(true)}>Something else</button>
              <button type="button" className="cyb-link" onClick={() => { setPhase('ask'); setChanging(false); }}>Start again</button>
            </div>
          </Card>
        )}
        {reading && unsure && (
          <p className="muted cyb-say-what">
            That did not read as a trade the city knows. Pick what you do from the list — or{' '}
            <button type="button" className="cyb-link" onClick={() => setPhase('ask')}>say it another way</button>.
          </p>
        )}

        {/* THE FORM THAT HAS ALWAYS EXISTED, pre-filled. `key` remounts it
            when the trade changes so its answers start clean for the new
            type — a salon must not quietly keep a restaurant's cuisines. */}
        <ListingForm
          key={`${trade?.categoryKey ?? ''}:${trade?.typeKey ?? ''}`}
          initial={{
            ...(trade ? { categoryKey: trade.categoryKey, businessType: trade.typeKey } : {}),
            ...(reading?.name ? { businessName: reading.name } : {}),
            ...(reading?.city ? { city: reading.city } : {}),
            ...(reading?.area ? { areas: [reading.area] } : {}),
          }}
          understood={!!trade && !changing}
          onChangeTrade={() => setChanging(true)}
          submitLabel="Create my business" busyLabel="Creating…"
          pending={create.isPending} error={err}
          onCancel={() => nav('/services/browse')}
          onSubmit={(v) => {
            setErr(null);
            create.mutate({
              businessName: v.businessName,
              ...(v.slug ? { slug: v.slug } : {}),
              ...(v.businessType ? { businessType: v.businessType, details: v.details } : {}),
              categoryKey: v.categoryKey,
              about: v.about || undefined,
              city: v.city,
              areas: v.areas || undefined,
              building: v.building || undefined,
              street: v.street || undefined,
              ...(v.logoUrl ? { logoUrl: v.logoUrl } : {}),
              phone: v.phone || undefined,
              priceFrom: v.priceFrom,
              ...(v.photoUrls.length ? { photoUrls: v.photoUrls } : {}),
              ...(v.lat != null ? { lat: v.lat, lng: v.lng } : {}),
              ...(v.radiusKm != null ? { radiusKm: v.radiusKm } : {}),
            }, {
              onSuccess: (card) => { setMade(card); setPhase('ready'); window.scrollTo(0, 0); },
              // The error the server actually gave, not a shrug. A form that
              // says "something went wrong" after somebody typed for four
              // minutes is how a listing silently never gets made.
              onError: (e: unknown) => {
                const m = e as { response?: { data?: { message?: string | string[] } } };
                const raw = m?.response?.data?.message;
                setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not save that. Check the fields and try again.');
              },
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="cyb">
      <div className="eyebrow">Local Market</div>
      <h1 className="cyb-h">Create your business on Together City</h1>
      <p className="cyb-lead">Tell us what you do. We build the rest.</p>

      <Card className="cyb-card">
        <label htmlFor="cyb-what" className="cyb-q">What kind of business do you have?</label>
        <textarea id="cyb-what" className="cyb-say" rows={3} maxLength={400} value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && text.trim().length >= 2) { e.preventDefault(); go(); } }}
          placeholder="I own a café in Bandra that serves coffee, sandwiches and desserts." />
        <div className="cyb-eg" role="group" aria-label="For example">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" className="cyb-eg-k" onClick={() => setText(e)}>{e}</button>
          ))}
        </div>
        {err && <p className="cyb-err" role="alert">{err}</p>}
        <div className="cyb-row">
          <Button variant="accent" disabled={text.trim().length < 2 || understand.isPending} onClick={go}>
            {understand.isPending ? 'Reading…' : 'Continue →'}
          </Button>
          <button type="button" className="cyb-link" onClick={skip}>Pick from the list instead</button>
        </div>
      </Card>

      {/* WHAT HAPPENS NEXT, said once. Restaurants become restaurants, shops
          become stores — the owner's own sentence for the whole feature. */}
      <p className="muted cyb-say-what">
        Restaurants get a menu people order from. Shops get a stock list and a basket. Salons get
        services and rates. Doctors get a consultation page. Mechanics get a job request with a photo.
        You give the facts; Together City builds what your business needs, and only asks what it needs to.
      </p>
    </div>
  );
}
