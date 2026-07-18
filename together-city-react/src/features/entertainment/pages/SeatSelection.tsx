import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntPage, TrustBar } from './parts';

const CSS = `
.ent-seats .seatwrap{max-width:720px;margin:0 auto}
.ent-seats .screen{width:80%;height:34px;margin:0 auto 34px;border-radius:0 0 60% 60%/0 0 100% 100%;background:linear-gradient(to bottom,rgba(212,175,94,.5),transparent);text-align:center;font-size:10px;letter-spacing:.24em;color:var(--muted);padding-top:6px;text-transform:uppercase}
.ent-seats .seatrow{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:9px}
.ent-seats .seatrow .rl{width:18px;font-size:11px;color:var(--muted);font-weight:600;text-align:right}
.ent-seats .seat{width:24px;height:24px;border-radius:6px 6px 3px 3px;background:var(--line,#e5e5e5);cursor:pointer;transition:background .15s,transform .15s}
.ent-seats .seat:hover{transform:scale(1.12)}
.ent-seats .seat.gold{background:rgba(212,175,94,.35)}
.ent-seats .seat.premium{background:rgba(91,75,138,.4)}
.ent-seats .seat.taken{background:var(--muted);opacity:.35;cursor:not-allowed}
.ent-seats .seat.sel{background:var(--accent)!important;box-shadow:0 0 0 2px var(--accent-soft)}
.ent-seats .legend{display:flex;justify-content:center;gap:22px;margin:26px 0 8px;font-size:11.5px;color:var(--muted);flex-wrap:wrap}
.ent-seats .legend span{display:flex;align-items:center;gap:6px}
.ent-seats .legend i{width:14px;height:14px;border-radius:4px;display:inline-block}
.ent-seats .detail-lay{display:grid;grid-template-columns:1fr 320px;gap:32px;align-items:start;margin-top:8px}
@media(max-width:860px){.ent-seats .detail-lay{grid-template-columns:1fr}}
.ent-seats .summarycard{position:sticky;top:20px;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;padding:24px;box-shadow:var(--shadow-deep)}
.ent-seats .summarycard .row2{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-soft);margin:8px 0}
.ent-seats .summarycard .tot{display:flex;justify-content:space-between;font-weight:600;font-size:16px;border-top:1px solid var(--line,#eee);padding-top:12px;margin-top:8px}
`;

type Cls = 'gold' | 'premium' | 'standard';
const PRICE: Record<Cls, number> = { gold: 450, premium: 320, standard: 220 };

interface Seat { id: string; cls: Cls; taken?: boolean }

const ROWS: { rl: string; cls: Cls; taken: number[] }[] = [
  { rl: 'A', cls: 'gold', taken: [4] },
  { rl: 'B', cls: 'gold', taken: [3, 4] },
  { rl: 'C', cls: 'premium', taken: [] },
  { rl: 'D', cls: 'premium', taken: [4, 5] },
  { rl: 'E', cls: 'standard', taken: [] },
  { rl: 'F', cls: 'standard', taken: [5] },
];

const buildRow = (rl: string, cls: Cls, taken: number[]): Seat[] =>
  Array.from({ length: 8 }, (_, i) => ({ id: `${rl}${i + 1}`, cls, taken: taken.includes(i + 1) }));

/** Seat selection — pick seats from the auditorium map with a live ticket summary. */
export function SeatSelection() {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (s: Seat) => {
    if (s.taken) return;
    setSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
  };
  const seatPrice = (id: string) => PRICE[(ROWS.find((r) => r.rl === id[0])!.cls)];
  const total = selected.reduce((sum, id) => sum + seatPrice(id) + 40, 0);

  return (
    <EntPage className="ent-seats">
      <style>{CSS}</style>
      <div className="eyebrow rise">Interstellar · PVR Phoenix Marketcity · 10:30 AM</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 20 }}>Choose your seats</h1>

      <div className="detail-lay rise d1">
        <section className="seatwrap">
          <div className="screen">Screen this way</div>

          {ROWS.map((r) => (
            <div className="seatrow" key={r.rl}>
              <span className="rl">{r.rl}</span>
              {buildRow(r.rl, r.cls, r.taken).map((s) => {
                const on = selected.includes(s.id);
                const cls = ['seat', s.cls === 'gold' ? 'gold' : s.cls === 'premium' ? 'premium' : '', s.taken ? 'taken' : '', on ? 'sel' : ''].filter(Boolean).join(' ');
                return <span key={s.id} className={cls} title={s.taken ? 'Taken' : s.id} onClick={() => toggle(s)} />;
              })}
            </div>
          ))}

          <div className="legend">
            <span><i style={{ background: 'rgba(212,175,94,.35)' }} />Gold ₹450</span>
            <span><i style={{ background: 'rgba(91,75,138,.4)' }} />Premium ₹320</span>
            <span><i style={{ background: 'var(--line)' }} />Standard ₹220</span>
            <span><i style={{ background: 'var(--accent)' }} />Selected</span>
            <span><i style={{ background: 'var(--muted)', opacity: .35 }} />Taken</span>
          </div>
          <p className="muted center" style={{ fontSize: 12, marginTop: 6 }}>Together+ members get early access to Gold row seats.</p>
        </section>

        <aside className="summarycard">
          <h4 style={{ marginBottom: 12 }}>Ticket summary</h4>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Interstellar · 10:30 AM · 2D</p>
          <div className="row2"><span>Seats</span><span>{selected.length ? selected.join(', ') : '—'}</span></div>
          <div className="row2"><span>Tickets</span><span>{selected.length}</span></div>
          <div className="row2"><span>Convenience fee</span><span>₹40</span></div>
          <div className="tot"><span>Total</span><span>₹{total}</span></div>
          <Link className="btn btn-gold" to="/entertainment/checkout" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Proceed to checkout</Link>
        </aside>
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
