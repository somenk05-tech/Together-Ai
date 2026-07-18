import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';

const CSS = `
.ent-curated .poster{aspect-ratio:2/3;border-radius:14px 14px 0 0;display:flex;align-items:flex-end;padding:14px;color:#fff;position:relative;overflow:hidden}
.ent-curated .poster h5{color:#fff;font-size:14.5px;line-height:1.2;margin:0}
.ent-curated .iv1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.ent-curated .iv2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.ent-curated .iv3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
.ent-curated .moviecard{background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-curated .moviecard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-curated .moviecard .mb{padding:12px 14px 14px;font-size:12.5px;color:var(--muted)}
.ent-curated .moviecard .mb b{color:var(--ink);display:block;margin-bottom:2px}
.ent-curated .votecard{background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.ent-curated .votecard .avrow{display:flex;align-items:center;gap:10px;margin:14px 0}
.ent-curated .split{display:grid;grid-template-columns:2fr 1fr;gap:28px}
@media(max-width:860px){.ent-curated .split{grid-template-columns:1fr}}
`;

const INDIE = [
  { t: 'Along the Road', g: 'Drama', p: '₹50 · rent', tint: 'iv1' },
  { t: 'The Silent Echo', g: 'Thriller', p: '₹60 · rent', tint: 'iv2' },
  { t: 'Between Two Skies', g: 'Romance', p: '₹70 · rent', tint: 'iv3' },
  { t: 'The Last Frame', g: 'Documentary', p: '₹50 · rent', tint: 'iv1' },
  { t: 'When Light Fades', g: 'Drama', p: '₹80 · rent', tint: 'iv2' },
];
const USER = [
  { t: 'The Last Page', g: 'Short Film', p: '₹10 · rent', tint: 'iv3' },
  { t: 'Chasing Dreams', g: 'Documentary', p: '₹20 · rent', tint: 'iv1' },
  { t: '7 Minutes', g: 'Drama', p: '₹50 · rent', tint: 'iv2' },
];
const UPNEXT = ['Whispers of the Wind', 'The Paper Boat', 'Midnight Diaries'];

/** Curated Movies — hand-picked indie cinema, pay-per-view and watch-with-friends voting. */
export function Curated() {
  return (
    <EntPage className="ent-curated">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 03" title="Curated by you. Created by them." sub="Independent cinema, pay-per-view — small budgets, big stories." />
      <PosterHero src="/assets/img/curated-hero.webp" alt="Home is Us — an original series, only on Together OTT" />

      <div className="split rise d1">
        <div>
          <div className="blk-head"><h2>India's Indie Spotlight</h2></div>
          <div className="grid4" style={{ marginBottom: 36 }}>
            {INDIE.map((m) => (
              <div className="moviecard" key={m.t}>
                <div className={`poster ${m.tint}`}><h5>{m.t}</h5></div>
                <div className="mb"><b>{m.g}</b>{m.p}</div>
              </div>
            ))}
          </div>

          <div className="blk-head"><h2>Why this? — AI picks for you</h2></div>
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>◈ Because you rated <b>Interstellar</b> and <b>Dune: Part Two</b> highly, we think you'll love <b>Between Two Skies</b> — a slow-burn romance with the same widescreen, atmospheric pacing.</p>
          </div>

          <div className="blk-head"><h2>User Movies — rentals</h2></div>
          <div className="grid3">
            {USER.map((m) => (
              <div className="moviecard" key={m.t}>
                <div className={`poster ${m.tint}`} style={{ aspectRatio: '16/10' }}><h5>{m.t}</h5></div>
                <div className="mb"><b>{m.g}</b>{m.p}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Why Curated?</h4>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Every film here is hand-picked by our editors and independent filmmakers — no algorithm noise, just stories worth ₹50.</p>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Pay Per View</h4>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>₹10–₹100 per film. No subscription. 48-hour access once rented.</p>
          </div>
          <div className="votecard" style={{ marginBottom: 16 }}>
            <h4>Watch with friends — vote</h4>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Your circle is deciding tonight's watch:</p>
            <div className="avrow">
              <div style={{ display: 'flex' }}><div className="av sm">NS</div><div className="av sm">RM</div><div className="av sm">FZ</div></div>
              <span style={{ fontSize: 12.5 }}>voted <b>Between Two Skies</b></span>
            </div>
            <button type="button" className="btn btn-gold btn-sm" style={{ width: '100%', justifyContent: 'center' }}>Cast your vote</button>
          </div>
          <div className="card">
            <h4>Coming Up Next</h4>
            <div className="rows" style={{ marginTop: 10 }}>
              {UPNEXT.map((t) => (
                <div className="row" key={t} style={{ boxShadow: 'none', padding: '8px 10px' }}>
                  <div className="grow"><div className="t" style={{ fontSize: 12.5 }}>{t}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <TrustBar items={['Support indie cinema', '₹10–₹100 per film', 'Curated, not algorithmic', 'Watch with friends']} />
    </EntPage>
  );
}
