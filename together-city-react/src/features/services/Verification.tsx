import { useState } from 'react';
import { Button, Fold } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useListingTrust, useSubmitVerification, useSubmitVerificationVideo, type DocKind, type EntityKind, type ListingTrust, type TrustSummary } from './api';

/**
 * THE BADGE, AND WHY IT IS THREE WORDS AND A SENTENCE.
 *
 * "Verified" on its own reads as Together City standing behind the shop. Every
 * label here says WHAT WAS CHECKED, and the sentence under it says who checked
 * it and what it is not. The server writes both strings — one wording, on one
 * side, so the page and the API can never disagree about what a badge claims.
 *
 * Basic renders nothing at all. A grey "not verified" chip would mark every
 * honest new business in the city on the day it most needs answering.
 */
export function TrustBadge({ trust }: { trust: TrustSummary | null | undefined }) {
  if (!trust?.label) return null;
  const strong = trust.tier === 'trusted';
  return (
    <span
      title={trust.blurb ?? undefined}
      style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
        color: strong ? 'var(--gold-ink)' : 'var(--ok-ink)',
        border: `1px solid ${strong ? 'var(--gold-ink)' : 'var(--ok-line)'}`,
        background: strong ? 'transparent' : 'var(--ok-soft)',
        borderRadius: 'var(--r-full)', padding: '2px 8px', whiteSpace: 'nowrap',
      }}
    >
      {trust.label}
    </span>
  );
}

/** The sentence that goes under the badge on a public page. Never a tooltip
 *  alone — a claim a citizen can only reach with a mouse is a claim on desktop. */
export function TrustNote({ trust }: { trust: TrustSummary | null | undefined }) {
  if (!trust?.blurb) return null;
  return <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>{trust.blurb}</p>;
}

const field = {
  padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)',
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)',
  width: '100%', boxSizing: 'border-box' as const,
};

/**
 * WHAT THE LADDER LOOKS LIKE FROM THE INSIDE.
 *
 * Four rows, ticked or not, and one sentence saying the next thing to do. A
 * ladder with no next step written on it is one people give up on at the first
 * rung — and the rung an owner is standing on is exactly the moment they are
 * willing to do the work.
 */
function Rungs({ t }: { t: ListingTrust }) {
  const rows: Array<[string, boolean, string]> = [
    ['Mobile number', t.phoneVerified, 'Confirmed by code'],
    ['Who you are', t.identityVerified, 'A government ID, matched to you'],
    ['The business', t.docStatus === 'verified', t.docStatus === 'submitted' ? 'With us now' : 'A registration document'],
    ['Where you work', t.placeConfirmed, 'Your pin, checked against the areas you serve'],
    ['On video', t.videoStatus === 'verified', t.videoStatus === 'submitted' ? 'With us now' : 'A short clip of you at your business'],
  ];
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      {rows.map(([label, done, hint]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
          <span aria-hidden style={{ color: done ? 'var(--ok-ink)' : 'var(--muted)', fontWeight: 700 }}>
            {done ? '✓' : '○'}
          </span>
          <span style={{ fontWeight: done ? 600 : 400 }}>{label}</span>
          <span className="muted" style={{ fontSize: 11.5 }}>{done ? 'Done' : hint}</span>
        </div>
      ))}
    </div>
  );
}

/** The owner on video — record, send, and a person watches it. */
function VideoRung({ listingId, t }: { listingId: string; t: ListingTrust }) {
  const send = useSubmitVerificationVideo(listingId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file?: File | null) => {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const key = await mediaApi.uploadVerificationVideo(listingId, file);
      send.mutate(key, {
        onError: (e: unknown) => {
          const raw = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setErr(raw ?? 'That could not be sent just now.');
        },
      });
    } catch (e) { setErr(uploadErrorMessage(e)); }
    finally { setBusy(false); }
  };

  if (t.videoStatus === 'verified') return null; // the rung above already says Done
  return (
    <div className="vrung">
      <strong>Show us you and your shop</strong>
      {t.videoStatus === 'submitted' ? (
        <p className="muted vrung-line">
          Your video is with us. A person watches it — we write to you either way.
        </p>
      ) : (
        <>
          {t.videoStatus === 'rejected' && t.videoRejectReason && (
            <p role="alert" className="vrung-line vrung-bad">
              We could not accept that video: {t.videoRejectReason}
            </p>
          )}
          <p className="muted vrung-note">
            A short clip — you, at the business, saying your name and the business&rsquo;s. Under a
            minute is plenty. A person watches it, never a machine.
          </p>
          <input type="file" accept="video/*" capture="environment" disabled={busy || send.isPending}
            aria-label="A short video of you at your business" className="vrung-file"
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          {(busy || send.isPending) && <p className="muted vrung-note">Sending…</p>}
          {err && <p role="alert" className="vrung-line vrung-bad">{err}</p>}
        </>
      )}
    </div>
  );
}

/**
 * GET THIS BUSINESS VERIFIED.
 *
 * The tab an owner opens when neighbours have started queueing. It leads with
 * the count of people waiting, because that is the true thing that makes the
 * rest of the form worth filling in — not a marketing line about trust.
 */
export function VerificationTab({ listingId }: { listingId: string }) {
  const q = useListingTrust(listingId);
  const submit = useSubmitVerification(listingId);
  const [entityKind, setEntityKind] = useState<EntityKind | ''>('');
  const [docKind, setDocKind] = useState<DocKind | ''>('');
  const [docRef, setDocRef] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const t = q.data;
  if (!t) return null;

  // What is on the form now, falling back to what was sent last time. The
  // owner's unsaved choice wins over the stored one, so re-picking "sole
  // proprietor" does not snap back on the next refetch.
  const kind = entityKind || t.entityKind || '';
  const chosenDoc = docKind || t.docKind || '';
  const waiting = t.waiting;
  const pending = t.docStatus === 'submitted';
  // A freelancer has no business document to give and never will. Asking for
  // one anyway is how a form teaches people to lie, and capping every honest
  // tutor in the city at five neighbours a day is the wrong answer to a
  // question they cannot be asked.
  const wantsDoc = kind !== '' && kind !== 'individual';

  const send = () => {
    setErr(null);
    submit.mutate(
      { entityKind: kind as EntityKind, docKind: chosenDoc || undefined, docRef: docRef.trim() || undefined },
      {
        onError: (e: unknown) => {
          const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
          setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be sent just now.');
        },
      },
    );
  };

  const heading = t.tier === 'basic' ? 'Get verified' : (t.label ?? 'Verification');

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>Verification</strong>
        <TrustBadge trust={t} />
        {!t.gateLifted && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {waiting === 0
              ? `${t.freePerDay} new neighbours a day until you verify`
              : `${waiting} ${waiting === 1 ? 'neighbour is' : 'neighbours are'} waiting`}
          </span>
        )}
      </div>

      {/* THE ONE TRUE THING ON THIS TAB. Somebody messaged this business and
          the business has not been given it — that is worth more than any
          sentence about trust, and it is the only reason the form gets used. */}
      {waiting > 0 && (
        <p style={{ fontSize: 13, margin: '8px 0 0' }}>
          <strong>{waiting} {waiting === 1 ? 'neighbour has' : 'neighbours have'} messaged you</strong> beyond
          today&rsquo;s free {t.freePerDay}. They are not lost — verify and they arrive all at once.
        </p>
      )}

      <Fold
        title={heading}
        meta={t.nextStep ?? (t.gateLifted ? 'Nothing waiting on you' : undefined)}
        defaultOpen={waiting > 0 && !pending}
      >
        <Rungs t={t} />

        {t.nextStep && (
          <p style={{ fontSize: 13, margin: '10px 0 0' }}>{t.nextStep}</p>
        )}

        {t.docStatus === 'rejected' && t.docRejectReason && (
          <p role="alert" style={{ fontSize: 13, margin: '8px 0 0', color: 'var(--danger-ink)' }}>
            We could not accept that document: {t.docRejectReason}
          </p>
        )}

        {/* ── THE CAMERA (owner, 24 Aug). A short clip of you at your
            business, watched by a person — it stands in for the pin-check on
            the Trusted rung, and it is the check a citizen can feel: somebody
            SAW this place. Upload goes through the same media chokepoint as
            every file in the city; submitting decides nothing. */}
        <VideoRung listingId={listingId} t={t} />

        {!pending && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>
              <span className="muted">What are you?</span>
              <select style={field} value={kind} onChange={(e) => setEntityKind(e.target.value as EntityKind)}>
                <option value="">Choose one…</option>
                {t.entityKinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
            </label>

            {wantsDoc && (
              <>
                {t.why && <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t.why}</p>}
                <label style={{ fontSize: 12 }}>
                  <span className="muted">Which document?</span>
                  <select style={field} value={chosenDoc} onChange={(e) => setDocKind(e.target.value as DocKind)}>
                    <option value="">Choose one…</option>
                    {t.accepts.map((d) => <option key={d.kind} value={d.kind}>{d.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  <span className="muted">Its number, as printed</span>
                  <input style={field} value={docRef} onChange={(e) => setDocRef(e.target.value)}
                    maxLength={40} aria-label="Registration number" placeholder="27AAACT2727Q1ZW" />
                </label>
              </>
            )}

            {err && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{err}</p>}
            <div>
              <Button variant="accent" size="sm"
                disabled={!kind || (wantsDoc && (!chosenDoc || docRef.trim().length < 4)) || submit.isPending}
                onClick={send}>
                {submit.isPending ? 'Sending…' : 'Send for checking'}
              </Button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
              A person reads this, not a machine. We write to you either way, and a refusal says why.
            </p>
          </div>
        )}
      </Fold>
    </div>
  );
}
