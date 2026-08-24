import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  inr, payError, useBillableCustomers, useCreateInvoice, useSendInvoice, type DraftLine,
} from '../api';

/**
 * WRITING A BILL, ON A PHONE, IN A DOORWAY.
 *
 * ── The totals are computed here AND on the server, and that is on purpose ──
 *
 * Everywhere else in this feature the arithmetic lives in one place, because
 * two copies drift. This is the exception and it is a narrow one: what is drawn
 * below is a PREVIEW of a document that does not exist yet, so there is nothing
 * to ask the server about. The moment it is created the server prices it again
 * from the same rules and the stored total is that one — nothing downstream
 * ever reads the number on this screen.
 *
 * ── Who can be billed ──────────────────────────────────────────────────────
 *
 * A neighbour who has messaged this business AND shown it their name. The
 * business cannot type in a citizen it has never spoken to, which is the Local
 * Services anonymity rule applied to money rather than an inconvenience bolted
 * on top of it.
 */
export function CreateInvoice() {
  const { id: listingId } = useParams<{ id: string }>();
  const nav = useNavigate();
  const customers = useBillableCustomers(listingId);
  const create = useCreateInvoice();
  const send = useSendInvoice();

  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ name: '', qty: 1, unitPriceInr: 0 }]);
  const [discount, setDiscount] = useState('');
  const [taxPct, setTaxPct] = useState('');
  const [extra, setExtra] = useState('');
  const [notes, setNotes] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const field = {
    padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)',
    fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)',
    width: '100%', boxSizing: 'border-box' as const,
  };

  const subtotal = lines.reduce((s, l) => s + Math.max(1, l.qty) * Math.max(0, l.unitPriceInr), 0);
  const discountInr = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const taxRateBp = Math.round(Math.max(0, Math.min(100, Number(taxPct) || 0)) * 100);
  const taxInr = Math.round(((subtotal - discountInr) * taxRateBp) / 10_000);
  const extraInr = Math.max(0, Number(extra) || 0);
  const total = subtotal - discountInr + taxInr + extraInr;

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const ready = Boolean(customerId) && total > 0 && lines.some((l) => l.name.trim());

  const build = () => ({
    customerId,
    items: lines
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), qty: Math.max(1, l.qty), unitPriceInr: Math.max(0, l.unitPriceInr) })),
    ...(discountInr ? { discountInr } : {}),
    ...(taxRateBp ? { taxRateBp } : {}),
    ...(extraInr ? { extraInr } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    ...(dueOn ? { dueOn } : {}),
  });

  const save = (thenSend: boolean) => {
    if (!listingId) return;
    setErr(null);
    create.mutate({ listingId, body: build() }, {
      onSuccess: (inv) => {
        if (!thenSend) { nav(`/financial/invoices/${inv.id}`); return; }
        send.mutate(inv.id, {
          onSuccess: () => nav(`/financial/invoices/${inv.id}`),
          onError: (e: unknown) => setErr(payError(e, 'The invoice was saved but could not be sent. Open it and send it from there.')),
        });
      },
      onError: (e: unknown) => setErr(payError(e, 'That invoice could not be saved. Check the lines and try again.')),
    });
  };

  if (customers.isLoading) return <Spinner label="Loading your customers…" />;
  if (customers.isError) {
    return (
      <div>
        <div className="eyebrow">Local Services · New invoice</div>
        <EmptyState
          icon="⚠️"
          title="Couldn’t load who you can bill"
          hint="Nothing has been created. Your listing and its conversations are untouched — try again in a moment."
        />
      </div>
    );
  }

  const people = customers.data?.items ?? [];

  return (
    <div>
      <div className="eyebrow">Local Services · New invoice</div>
      <h1 style={{ fontSize: 26 }}>Create an invoice</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        It arrives in your conversation with them and in their invoices, and they can pay it from
        their wallet or a card.
      </p>

      {people.length === 0 ? (
        <EmptyState
          title="Nobody to bill yet"
          hint="Invoices go to neighbours who have messaged you and shown their name."
          action={<Link to="/services/messages" style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13.5 }}>Open your messages →</Link>}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12.5 }}>
              <span className="muted">Customer</span>
              <select
                style={field} value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                aria-label="Who this invoice is for"
              >
                <option value="">Choose a neighbour…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.alias}</option>
                ))}
              </select>
            </label>
          </Card>

          <Card style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <strong style={{ fontSize: 13.5 }}>What they are paying for</strong>
              <Button
                variant="line" size="sm" style={{ marginLeft: 'auto' }}
                onClick={() => setLines((r) => [...r, { name: '', qty: 1, unitPriceInr: 0 }])}
              >
                ＋ Add a line
              </Button>
            </div>

            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) 68px minmax(0,1.4fr) 44px', gap: 6, alignItems: 'center' }}>
                <input
                  style={field} value={l.name} maxLength={120}
                  onChange={(e) => setLine(i, { name: e.target.value })}
                  aria-label={`Line ${i + 1} description`} placeholder="Haircut"
                />
                <input
                  style={field} type="number" min={1} value={l.qty}
                  onChange={(e) => setLine(i, { qty: Number(e.target.value) || 1 })}
                  aria-label={`Line ${i + 1} quantity`}
                />
                <input
                  style={field} type="number" min={0} value={l.unitPriceInr || ''}
                  onChange={(e) => setLine(i, { unitPriceInr: Number(e.target.value) || 0 })}
                  aria-label={`Line ${i + 1} unit price in rupees`} placeholder="₹"
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((r) => r.filter((_, n) => n !== i))}
                  style={{
                    minHeight: 44, minWidth: 44, background: 'none', border: 0,
                    cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                    color: 'var(--muted)', fontFamily: 'inherit', fontSize: 15,
                    opacity: lines.length === 1 ? 0.4 : 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </Card>

          <Card style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 13.5 }}>Adjustments</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">Discount ₹</span>
                <input style={field} type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Discount in rupees" />
              </label>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">Tax %</span>
                <input style={field} type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} aria-label="Tax percentage" />
              </label>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">Additional charges ₹</span>
                <input style={field} type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Additional charges in rupees" />
              </label>
              <label style={{ fontSize: 12.5 }}>
                <span className="muted">Due</span>
                <input style={field} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
              </label>
            </div>
            <label style={{ fontSize: 12.5 }}>
              <span className="muted">Notes</span>
              <input
                style={field} value={notes} maxLength={1200}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth saying — warranty, next visit, how to reach you"
              />
            </label>
            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
              Tax is charged after the discount and before additional charges.
            </p>
          </Card>

          <Card>
            <div style={{ display: 'grid', gap: 3, fontSize: 13 }}>
              <Row label="Subtotal" value={subtotal} />
              {discountInr > 0 && <Row label="Discount" value={discountInr} negative />}
              {taxInr > 0 && <Row label="Tax" value={taxInr} />}
              {extraInr > 0 && <Row label="Additional charges" value={extraInr} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10, fontSize: 17, fontWeight: 800 }}>
                <span>Total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(total)}</span>
              </div>
            </div>

            {err && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '10px 0 0' }}>{err}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Button
                variant="accent" disabled={!ready || create.isPending || send.isPending}
                onClick={() => save(true)}
              >
                {create.isPending || send.isPending ? 'Sending…' : `Send invoice · ${inr(total)}`}
              </Button>
              <Button variant="line" disabled={!ready || create.isPending} onClick={() => save(false)}>
                Save as draft
              </Button>
              <Link to={`/services/${listingId}/invoices`}>
                <Button variant="line">Cancel</Button>
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="muted">{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{negative ? '−' : ''}{inr(value)}</span>
    </div>
  );
}
