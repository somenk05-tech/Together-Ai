import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { PaymentSheet } from '../PaymentSheet';
import { usePayBill, payError, inr, type PayMethod } from '../api';

/* ── Static bill data — no dedicated backend endpoint, mirrored from the site ── */
interface CardBill { id: string; nm: string; num: string; out: number; min: number; due: string; limit: number }
interface Emi { id: string; nm: string; desc: string; monthly: number; paid: number; total: number; due: string }
interface Rent { id: string; nm: string; desc: string; monthly: number; due: string }

const CARDS: CardBill[] = [
  { id: 'cc_hdfc', nm: 'HDFC Regalia', num: '4821', out: 42300, min: 2120, due: '18 Jul', limit: 300000 },
  { id: 'cc_icici', nm: 'ICICI Amazon Pay', num: '2290', out: 8940, min: 450, due: '25 Jul', limit: 120000 },
];
const EMIS: Emi[] = [
  { id: 'emi_iphone', nm: 'iPhone 15 Pro', desc: 'No-cost EMI · Together Shop', monthly: 8499, paid: 6, total: 12, due: '5 Aug' },
  { id: 'emi_reno', nm: 'Home renovation loan', desc: 'HDFC personal loan', monthly: 15200, paid: 14, total: 36, due: '2 Aug' },
  { id: 'emi_car', nm: 'Car loan', desc: 'Maruti · SBI', monthly: 22000, paid: 20, total: 60, due: '7 Aug' },
];
const RENTS: Rent[] = [
  { id: 'rent_home', nm: 'Home rent', desc: 'Kumar Paradise, Koregaon Park · to landlord', monthly: 45000, due: '1 Aug' },
  { id: 'rent_parking', nm: 'Parking & society', desc: 'Monthly maintenance', monthly: 3200, due: '5 Aug' },
];

type TabKey = 'cards' | 'emis' | 'rents';
const TABS: { t: TabKey; label: string; icon: string }[] = [
  { t: 'cards', label: 'Credit Cards', icon: '💳' },
  { t: 'emis', label: 'EMIs', icon: '📆' },
  { t: 'rents', label: 'Rents', icon: '🏠' },
];

interface Pending { kind: TabKey; id: string; amountInr: number; label: string }

function DuePill({ due, paid, done }: { due?: string; paid?: boolean; done?: boolean }) {
  const base: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, display: 'inline-block' };
  if (done) return <span style={{ ...base, background: '#eaf2ec', color: '#2e5c3f' }}>Completed</span>;
  if (paid) return <span style={{ ...base, background: '#eaf2ec', color: '#2e5c3f' }}>✓ Paid this month</span>;
  return <span style={{ ...base, background: '#fdf0d0', color: '#7a5c00' }}>Due {due}</span>;
}

function PayCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 14 }}>
      {children}
    </div>
  );
}
function Bar({ pct }: { pct: number }) {
  return (
    <div style={{ background: 'var(--line)', borderRadius: 999, height: 7, overflow: 'hidden', margin: '10px 0 4px' }}>
      <span style={{ display: 'block', height: '100%', borderRadius: 999, background: 'var(--accent)', width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
function Top({ nm, sub, right }: { nm: React.ReactNode; sub: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div><div style={{ fontWeight: 700, fontSize: 15 }}>{nm}</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{sub}</div></div>
      <div style={{ textAlign: 'right' }}>{right}</div>
    </div>
  );
}
function Meta({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '14px 0 6px' }}>
      {items.map(([lab, v]) => (
        <div key={lab}>
          <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>{lab}</div>
          <div style={{ fontSize: 14, marginTop: 3 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
const amt: React.CSSProperties = { fontFamily: 'var(--serif)', fontSize: 22 };

/** Payments — credit-card bills, EMIs and rent, tracked in one place. Every payment flows into Budget Monitoring. */
export function Payments() {
  const payBill = usePayBill();
  const [tab, setTab] = useState<TabKey>('cards');
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [paidAmt, setPaidAmt] = useState<Record<string, number>>({});
  const [emiExtra, setEmiExtra] = useState<Record<string, number>>({});
  const [autoRent, setAutoRent] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emiDone = (e: Emi) => e.paid + (emiExtra[e.id] || 0);
  const dueOf = (id: string, value: number) => (paid[id] ? 0 : value);

  const cardCount = CARDS.filter((c) => !paid[c.id]).length;
  const emiCount = EMIS.filter((e) => !paid[e.id] && emiDone(e) < e.total).length;
  const rentCount = RENTS.filter((r) => !paid[r.id]).length;
  const counts: Record<TabKey, number> = { cards: cardCount, emis: emiCount, rents: rentCount };

  const { due, upcoming } = useMemo(() => {
    let d = 0, n = 0;
    CARDS.forEach((c) => { const v = dueOf(c.id, c.out); d += v; if (v > 0) n++; });
    EMIS.forEach((e) => { const v = emiDone(e) >= e.total ? 0 : dueOf(e.id, e.monthly); d += v; if (v > 0) n++; });
    RENTS.forEach((r) => { const v = dueOf(r.id, r.monthly); d += v; if (v > 0) n++; });
    return { due: d, upcoming: n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, emiExtra]);
  const paidThisMonth = Object.values(paidAmt).reduce((a, b) => a + b, 0);

  function openPay(kind: TabKey, id: string, amountInr: number, label: string) {
    setError(null);
    setPending({ kind, id, amountInr, label });
  }
  function confirmPay(method: PayMethod) {
    if (!pending) return;
    const p = pending;
    payBill.mutate(
      { hub: 'Financial', category: 'bills', label: p.label, amountInr: p.amountInr, method },
      {
        onSuccess: () => {
          setPaid((s) => ({ ...s, [p.id]: true }));
          setPaidAmt((s) => ({ ...s, [p.id]: p.amountInr }));
          if (p.kind === 'emis') {
            const e = EMIS.find((x) => x.id === p.id);
            if (e && emiDone(e) < e.total) setEmiExtra((s) => ({ ...s, [p.id]: (s[p.id] || 0) + 1 }));
          }
          setPending(null);
        },
        onError: (err) => setError(payError(err)),
      },
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Financial District · 03</div>
      <h1 style={{ fontSize: 'clamp(26px,3vw,40px)', marginBottom: 6 }}>Payments</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Credit-card bills, EMIs and rent — tracked in one place. Every payment flows straight into your Budget Monitoring.
      </p>

      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div className="stat" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
            <span className="lab">Due this month</span><div className="val" style={{ fontSize: 22 }}>{inr(due)}</div>
          </div>
          <div className="stat" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
            <span className="lab">Paid this month</span><div className="val" style={{ fontSize: 22 }}>{inr(paidThisMonth)}</div>
          </div>
          <div className="stat" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
            <span className="lab">Upcoming items</span><div className="val" style={{ fontSize: 22 }}>{upcoming}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '0 0 22px', flexWrap: 'wrap' }}>
        {TABS.map((tb) => {
          const on = tab === tb.t;
          return (
            <button key={tb.t} type="button" onClick={() => setTab(tb.t)}
              style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)',
                borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {tb.icon} {tb.label}
              <span style={{ background: on ? 'rgba(255,255,255,.26)' : 'rgba(0,0,0,.12)', borderRadius: 999, fontSize: 11, padding: '0 7px' }}>{counts[tb.t]}</span>
            </button>
          );
        })}
      </div>

      {tab === 'cards' && CARDS.map((c) => {
        const isPaid = !!paid[c.id];
        const usedPct = Math.round((c.out / c.limit) * 100);
        return (
          <PayCard key={c.id}>
            <Top
              nm={<>{c.nm} <span className="muted" style={{ fontWeight: 400 }}>•••• {c.num}</span></>}
              sub="Credit card bill"
              right={<><div style={amt}>{inr(isPaid ? 0 : c.out)}</div><div style={{ marginTop: 4 }}><DuePill due={c.due} paid={isPaid} /></div></>}
            />
            <Meta items={[['Total outstanding', inr(c.out)], ['Minimum due', inr(c.min)], ['Credit used', `${usedPct}%`]]} />
            <Bar pct={usedPct} />
            {!isPaid && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <Button variant="line" size="sm" onClick={() => openPay('cards', c.id, c.min, `${c.nm} — minimum due`)}>Pay minimum {inr(c.min)}</Button>
                <Button variant="accent" size="sm" onClick={() => openPay('cards', c.id, c.out, `${c.nm} — full bill`)}>Pay full {inr(c.out)}</Button>
              </div>
            )}
          </PayCard>
        );
      })}

      {tab === 'emis' && EMIS.map((e) => {
        const done = emiDone(e), finished = done >= e.total, isPaid = !!paid[e.id];
        return (
          <PayCard key={e.id}>
            <Top
              nm={e.nm} sub={e.desc}
              right={<><div style={amt}>{inr(e.monthly)}<span className="muted" style={{ fontSize: 12 }}>/mo</span></div>
                <div style={{ marginTop: 4 }}><DuePill due={e.due} paid={isPaid} done={finished} /></div></>}
            />
            <Meta items={[['Instalments', `${done} of ${e.total} paid`], ['Remaining', inr((e.total - done) * e.monthly)], ['Next due', finished ? '—' : e.due]]} />
            <Bar pct={Math.round((done / e.total) * 100)} />
            {!finished && !isPaid && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <Button variant="accent" size="sm" onClick={() => openPay('emis', e.id, e.monthly, `${e.nm} — EMI ${done + 1}/${e.total}`)}>Pay this month {inr(e.monthly)}</Button>
              </div>
            )}
          </PayCard>
        );
      })}

      {tab === 'rents' && RENTS.map((r) => {
        const isPaid = !!paid[r.id];
        return (
          <PayCard key={r.id}>
            <Top
              nm={r.nm} sub={r.desc}
              right={<><div style={amt}>{inr(r.monthly)}<span className="muted" style={{ fontSize: 12 }}>/mo</span></div>
                <div style={{ marginTop: 4 }}><DuePill due={r.due} paid={isPaid} /></div></>}
            />
            {!isPaid && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <Button variant="accent" size="sm" onClick={() => openPay('rents', r.id, r.monthly, `${r.nm} — monthly`)}>Pay rent {inr(r.monthly)}</Button>
                <Button variant="line" size="sm" disabled={autoRent[r.id]}
                  onClick={() => setAutoRent((s) => ({ ...s, [r.id]: true }))}>
                  {autoRent[r.id] ? '✓ Auto-pay on' : 'Set auto-pay'}
                </Button>
              </div>
            )}
            {autoRent[r.id] && !isPaid && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Auto-pay enabled — we'll pay this rent on its due date.</div>
            )}
          </PayCard>
        );
      })}

      <div className="trust" style={{ marginTop: 20 }}>
        <span>◈ Bank-Level Encryption</span><span>◈ Auto-synced to Budget</span><span>◈ Reminders before due dates</span>
      </div>

      <PaymentSheet
        open={!!pending}
        amountInr={pending?.amountInr ?? 0}
        label={pending?.label ?? ''}
        pending={payBill.isPending}
        error={error}
        onPay={confirmPay}
        onCancel={() => { setPending(null); setError(null); }}
      />
    </div>
  );
}
