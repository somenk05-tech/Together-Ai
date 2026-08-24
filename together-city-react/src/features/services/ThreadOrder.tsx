import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import {
  rupees, useAcceptOrder, useAdvanceOrder, useCancelOrder, useRejectOrder,
  useOrder, type OrderStatus, type ServiceOrderView,
} from './api';

/**
 * AN ORDER, IN THE CONVERSATION IT BELONGS TO — same delivery as an invoice:
 * the row's plain sentence is what a client that knows nothing about orders
 * shows, and the id upgrades it to this card, which is where everything
 * happens. The kitchen accepts, rejects and walks the status forward HERE,
 * because their business chat is the one screen they already watch; the
 * citizen watches the same card change under the same message.
 *
 * The card polls while the order is live and rests when it is finished — a
 * kitchen does not press refresh, and neither does somebody hungry.
 */

const STEPS: OrderStatus[] = ['submitted', 'accepted', 'preparing', 'ready', 'completed'];

const failText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

function StatusStrip({ o }: { o: ServiceOrderView }) {
  if (o.status === 'rejected' || o.status === 'cancelled') {
    return (
      <div className="svo-dead">
        {o.status === 'rejected' ? 'Rejected' : 'Cancelled'}
        {o.rejectReason ? ` — ${o.rejectReason}` : o.cancelReason ? ` — ${o.cancelReason}` : ''}
      </div>
    );
  }
  const at = STEPS.indexOf(o.status);
  return (
    <div className="svo-steps" aria-label={`Order status: ${o.status}`}>
      {STEPS.map((s, i) => (
        <span key={s} className={`svo-step${i <= at ? ' is-on' : ''}`}>{s}</span>
      ))}
    </div>
  );
}

/** The card's middle — the same lines both sides agreed to. */
function OrderLines({ o }: { o: ServiceOrderView }) {
  return (
    <div className="svo-lines">
      {o.lines.map((l, i) => (
        <div key={i} className="svo-line">
          <span>
            {l.name}{l.variant ? ` (${l.variant})` : ''} × {l.qty}
            {(l.addons ?? []).length > 0 && <span className="muted"> — {(l.addons ?? []).map((a) => a.name).join(', ')}</span>}
          </span>
          <span className="svo-amt">{rupees(l.lineTotalInr)}</span>
        </div>
      ))}
      <div className="svo-total"><span>Total · paid</span><span>{rupees(o.totalInr)}</span></div>
    </div>
  );
}

/**
 * THE KITCHEN'S VERBS. Accept asks for the wait in minutes; reject insists on
 * a reason, because the citizen reads it verbatim and "REJECTED" alone is a
 * door shut in somebody's face. After accept the same row walks the order
 * forward one step at a time — the server refuses skips either way.
 */
function OwnerVerbs({ o }: { o: ServiceOrderView }) {
  const accept = useAcceptOrder(o.id);
  const reject = useRejectOrder(o.id);
  const advance = useAdvanceOrder(o.id);
  const [mins, setMins] = useState('25');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const onErr = (e: unknown) => setErr(failText(e, 'That did not go through. The order is unchanged.'));

  const busy = accept.isPending || reject.isPending || advance.isPending;

  if (o.status === 'submitted') {
    return (
      <div className="svo-gap">
        {!rejecting ? (
          <div className="svo-row">
            <Button variant="accent" size="sm" disabled={busy}
              onClick={() => { setErr(null); accept.mutate({ prepMinutes: Number(mins) || undefined }, { onError: onErr }); }}>
              {accept.isPending ? 'Accepting…' : 'Accept order'}
            </Button>
            <label className="svo-minlabel">
              ready in
              <input className="svo-mini" value={mins} onChange={(e) => setMins(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                inputMode="numeric" aria-label="Minutes until ready" />
              min
            </label>
            <Button variant="line" size="sm" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
          </div>
        ) : (
          <div className="svo-row">
            <input className="svo-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus
              aria-label="Why you cannot take this order" placeholder="Why not? They read this, and their money goes straight back." />
            <Button variant="line" size="sm" disabled={busy || reason.trim().length < 3}
              onClick={() => { setErr(null); reject.mutate(reason.trim(), { onError: onErr }); }}>
              {reject.isPending ? 'Rejecting…' : 'Reject & refund'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Back</Button>
          </div>
        )}
        {err && <p className="svo-err" role="alert">{err}</p>}
      </div>
    );
  }

  const nextStep = (o.next as string[]).find((s) => ['preparing', 'ready', 'completed'].includes(s)) as
    | 'preparing' | 'ready' | 'completed' | undefined;
  if (!nextStep) return null;
  const verb = nextStep === 'preparing' ? 'Start preparing'
    : nextStep === 'ready' ? (o.fulfilment === 'delivery' ? 'Ready — out for delivery' : 'Ready to collect')
      : 'Mark completed';
  return (
    <div className="svo-gap6">
      <div>
        <Button variant="line" size="sm" disabled={busy}
          onClick={() => { setErr(null); advance.mutate(nextStep, { onError: onErr }); }}>
          {advance.isPending ? '…' : verb}
        </Button>
      </div>
      {err && <p className="svo-err" role="alert">{err}</p>}
    </div>
  );
}

function CitizenVerbs({ o }: { o: ServiceOrderView }) {
  const cancel = useCancelOrder(o.id);
  const [err, setErr] = useState<string | null>(null);
  if (o.status !== 'submitted') return null;
  return (
    <div className="svo-gap6">
      <div>
        <Button variant="line" size="sm" disabled={cancel.isPending}
          onClick={() => { setErr(null); cancel.mutate(undefined, { onError: (e) => setErr(failText(e, 'Could not cancel just now.')) }); }}>
          {cancel.isPending ? 'Cancelling…' : 'Cancel — money straight back'}
        </Button>
      </div>
      {err && <p className="svo-err" role="alert">{err}</p>}
    </div>
  );
}

/** The whole card — used in the thread and on the kitchen's board alike. */
export function OrderCard({ o }: { o: ServiceOrderView }) {
  const isOwner = o.customerName !== undefined;
  return (
    <div className="svo">
      <div className="svo-head">
        <span className="svo-num">{o.number}</span>
        <span className="svo-meta">
          {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
          {o.prepMinutes != null ? ` · ~${o.prepMinutes} min` : ''}
        </span>
      </div>
      <StatusStrip o={o} />
      <OrderLines o={o} />
      {o.note && <p className="svo-note"><span className="muted">Note:</span> {o.note}</p>}
      {o.adjustmentNote && <p className="svo-note"><span className="muted">Changed:</span> {o.adjustmentNote}</p>}

      {/* WHAT THEY SHARED — on the owner's copy only, because it is only in the
          owner's copy: the server never puts it in the citizen's. */}
      {isOwner && (
        <p className="svo-who">
          <strong>{o.customerName}</strong>
          {o.phone && <> · <a href={`tel:${o.phone}`}>{o.phone}</a></>}
          {o.addressText && <><br /><span className="muted">{o.addressText}</span></>}
          {o.lat != null && o.lng != null && (
            <>{' '}<a href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">pin</a></>
          )}
        </p>
      )}

      {!isOwner && <p className="svo-statusline">{o.statusLine}</p>}
      {isOwner ? <OwnerVerbs o={o} /> : <CitizenVerbs o={o} />}
    </div>
  );
}

/** The bubble in the thread: sentence while loading or gone, card once read. */
export function ThreadOrder({ orderId, body, at }: { orderId: string; body: string; at: string }) {
  const q = useOrder(orderId);
  const shell = (children: React.ReactNode) => (
    <div className="svo-shell">
      {children}
      <span className="svo-when">{at}</span>
    </div>
  );
  if (q.isLoading) return shell(<Spinner label="Opening the order…" />);
  // A read that failed — or an order whose citizen has since left the city.
  // The sentence is the truth we still have, so it is what gets shown.
  if (q.isError || !q.data) return shell(<span className="svo-body">{body}</span>);
  return shell(<OrderCard o={q.data} />);
}
