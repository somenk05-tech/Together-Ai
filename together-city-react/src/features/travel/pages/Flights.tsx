import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useAirports, useFlightSearch, useBookFlight, inr, type FlightResult, type FlightSearchInput } from '../api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { ShareToChat } from '@/features/chat/share';

const today = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };
const airlineTint = (code: string) => ({ '6E': '#1a2a80', AI: '#b30000', UK: '#5b2a86', QP: '#e6600f', SG: '#c81e1e', EK: '#c8102e', SQ: '#00205b', TG: '#4b1e78' } as Record<string, string>)[code] ?? '#444';

function FlightRow({ f, onBook }: { f: FlightResult; onBook: (f: FlightResult) => void }) {
  return (
    <article className="card" style={{ marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', borderLeft: f.best ? '4px solid var(--accent)' : undefined }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: airlineTint(f.airlineCode), color: '#fff', fontWeight: 800, fontSize: 13 }}>{f.airlineCode}</div>
      <div style={{ minWidth: 150 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{f.airline}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>{f.flightNo} · {f.cabin}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 16 }}>{f.departTime}</div><div className="muted" style={{ fontSize: 11 }}>{f.from}</div></div>
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <div className="muted" style={{ fontSize: 11 }}>{f.durationLabel}</div>
          <div style={{ height: 1, background: 'var(--line)', margin: '3px 0', position: 'relative' }}><span style={{ position: 'absolute', right: -2, top: -3, fontSize: 8 }}>✈</span></div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: f.stops === 0 ? '#2e7d32' : '#e65100' }}>{f.stopLabel}</div>
        </div>
        <div style={{ textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 16 }}>{f.arriveTime}{f.nextDay ? <sup style={{ fontSize: 9, color: '#c62828' }}>+1</sup> : ''}</div><div className="muted" style={{ fontSize: 11 }}>{f.to}</div></div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {f.cheapest && <span style={{ fontSize: 9, fontWeight: 700, color: '#2e7d32', background: '#e8f5e9', borderRadius: 999, padding: '1px 7px' }}>CHEAPEST</span>}
            {f.fastest && <span style={{ fontSize: 9, fontWeight: 700, color: '#1565c0', background: '#e3f2fd', borderRadius: 999, padding: '1px 7px' }}>FASTEST</span>}
            {f.best && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '1px 7px' }}>BEST</span>}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, marginTop: 3 }}>{inr(f.priceInr)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Button variant="accent" size="sm" onClick={() => onBook(f)}>Select</Button>
          <ShareToChat label="Share" item={{
            kind: 'flight', hub: 'Travel', title: `${f.airline} · ${f.from} → ${f.to}`,
            subtitle: `${f.flightNo} · ${f.cabin}`, priceInr: f.priceInr, deepLink: '/travel/flights',
            meta: [`🛫 ${f.departTime}`, `🛬 ${f.arriveTime}`, f.durationLabel, f.stopLabel],
          }} />
        </div>
      </div>
    </article>
  );
}

type Sort = 'best' | 'cheapest' | 'fastest';

/** Flights — Skyscanner-style metasearch. Results are generated (no external API). */
export function Flights() {
  const airports = useAirports();
  const [from, setFrom] = useState('BLR');
  const [to, setTo] = useState('DXB');
  const [date, setDate] = useState(today());
  const [pax, setPax] = useState(1);
  const [cabin, setCabin] = useState('economy');
  const [query, setQuery] = useState<FlightSearchInput | null>(null);
  const [sort, setSort] = useState<Sort>('best');
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [payFor, setPayFor] = useState<FlightResult | null>(null);

  const results = useFlightSearch(query);
  const book = useBookFlight();

  const flights = useMemo(() => {
    let list = results.data?.flights ?? [];
    if (nonstopOnly) list = list.filter((f) => f.stops === 0);
    const sorted = [...list];
    if (sort === 'cheapest') sorted.sort((a, b) => a.priceInr - b.priceInr);
    else if (sort === 'fastest') sorted.sort((a, b) => a.durationMins - b.durationMins);
    else sorted.sort((a, b) => (a.priceInr / 1000 + a.durationMins / 60) - (b.priceInr / 1000 + b.durationMins / 60));
    return sorted;
  }, [results.data, sort, nonstopOnly]);

  const opts = airports.data ?? [];
  const sel = { padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: 'var(--card, #fff)' } as const;
  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div><div className="eyebrow">Travel · Flights</div><h1 style={{ fontSize: 26, margin: 0 }}>Compare & book flights</h1></div>
        <Link to="/travel/explore" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Explore trips</Button></Link>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 14px' }}>Fares are generated on our own engine — no external booking site — so the same search always returns the same results.</p>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12 }}>From<br /><select value={from} onChange={(e) => setFrom(e.target.value)} style={sel}>{opts.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}</select></label>
        <Button variant="line" size="sm" onClick={swap} title="Swap">⇄</Button>
        <label style={{ fontSize: 12 }}>To<br /><select value={to} onChange={(e) => setTo(e.target.value)} style={sel}>{opts.map((a) => <option key={a.code} value={a.code}>{a.city} ({a.code})</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Depart<br /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sel} /></label>
        <label style={{ fontSize: 12 }}>Travellers<br /><input type="number" min={1} max={9} value={pax} onChange={(e) => setPax(Number(e.target.value))} style={{ ...sel, width: 70 }} /></label>
        <label style={{ fontSize: 12 }}>Cabin<br /><select value={cabin} onChange={(e) => setCabin(e.target.value)} style={sel}><option value="economy">Economy</option><option value="premium">Premium</option><option value="business">Business</option></select></label>
        <Button variant="accent" disabled={from === to} onClick={() => setQuery({ from, to, date, pax, cabin })}>Search flights</Button>
      </div>

      {!query ? (
        <EmptyState icon="✈️" title="Search to compare fares" hint="Pick a route and date above." />
      ) : results.isLoading ? <Spinner label="Searching fares…" />
        : results.isError || !results.data ? <EmptyState title="Couldn't search" hint="Try a different route." />
        : flights.length === 0 ? <EmptyState icon="🧭" title="No flights for that route" hint="Try other airports." />
        : (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{results.data.from?.city} → {results.data.to?.city}</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>· {flights.length} flights · {date}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {(['best', 'cheapest', 'fastest'] as Sort[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSort(s)} style={{ cursor: 'pointer', textTransform: 'capitalize', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${sort === s ? 'var(--accent)' : 'var(--line)'}`, background: sort === s ? 'var(--accent)' : 'transparent', color: sort === s ? '#fff' : 'var(--ink-soft)' }}>{s}</button>
                ))}
                <button type="button" onClick={() => setNonstopOnly((v) => !v)} style={{ cursor: 'pointer', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${nonstopOnly ? 'var(--accent)' : 'var(--line)'}`, background: nonstopOnly ? 'var(--accent)' : 'transparent', color: nonstopOnly ? '#fff' : 'var(--ink-soft)' }}>Non-stop</button>
              </div>
            </div>
            {flights.map((f) => <FlightRow key={f.id} f={f} onBook={setPayFor} />)}
          </div>
        )}

      <PaymentSheet
        open={!!payFor} amountInr={(payFor?.priceInr ?? 0) * pax}
        label={payFor ? `${payFor.airline} ${payFor.from}→${payFor.to} · ${pax} pax` : ''}
        pending={book.isPending} error={book.isError ? payError(book.error) : null}
        onCancel={() => setPayFor(null)}
        onPay={(method: PayMethod) => payFor && query && book.mutate({ ...query, flightId: payFor.id, method }, { onSuccess: () => setPayFor(null) })}
      />
    </div>
  );
}
