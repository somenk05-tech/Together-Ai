import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CO, POLICIES, VOLUMES } from './legal-data';

/** Styling for the policy body HTML + status pills. Scoped to .legal-root. */
const STYLE = `
.legal-root { --lg-line:var(--line); --lg-paper:var(--card); --lg-ink:var(--ink); --lg-accent:var(--accent-ink); --lg-muted:var(--muted); }
.legal-root { background:var(--lg-paper); color:var(--lg-ink); min-height:100vh; }
.legal-root a { color:var(--lg-accent); text-decoration:none; }
.legal-root a:hover { text-decoration:underline; }
.legal-root .serif { font-family:var(--serif, Georgia, serif); }
.legal-root .mono { font-family:'IBM Plex Mono', ui-monospace, monospace; }
.doc-body p { margin:0 0 1em; color:var(--ink-soft); }
.doc-body ul { margin:0 0 1.1em; padding-left:1.35em; }
.doc-body li { margin:0 0 .55em; color:var(--ink-soft); }
.doc-body strong { font-weight:600; color:var(--ink-soft); }
.doc-body .note { background:var(--accent-soft); border-left:3px solid var(--lg-accent); padding:14px 18px; border-radius:0 10px 10px 0; margin:0 0 1.2em; font-size:.96em; color:var(--warn-ink); }
.doc-body .tf { background:var(--warn-soft); border-bottom:1px dashed var(--warn-ink); padding:0 4px; border-radius:3px; font-family:'IBM Plex Mono',monospace; font-size:.82em; color:var(--warn-ink); }
`;

function pill(drafted: boolean) {
  return drafted
    ? { label: 'Published draft', bg: 'var(--accent-soft)', fg: 'var(--warn-ink)' }
    : { label: 'In preparation', bg: 'var(--accent-soft)', fg: 'var(--muted)' };
}

const shell: React.CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '0 28px' };

/** Together City Legal & Policy Center — hub list + individual policy view. */
export function LegalCenter() {
  const { policyId } = useParams<{ policyId?: string }>();
  const [q, setQ] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, [policyId]);

  const totalCount = useMemo(() => VOLUMES.reduce((n, v) => n + v.policies.length, 0), []);

  const policy = policyId ? POLICIES[policyId] : undefined;

  return (
    <div className="legal-root">
      <style>{STYLE}</style>

      {/* Sticky header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(242,239,231,.9)', backdropFilter: 'saturate(1.4) blur(10px)', borderBottom: '1px solid var(--lg-line)' }}>
        <div style={{ ...shell, padding: '15px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link to="/legal" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--lg-ink)' }}>
            <span className="serif" style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--lg-accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 17 }}>TC</span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span className="serif" style={{ fontWeight: 600, fontSize: 16 }}>Together City</span>
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--lg-muted)' }}>Legal &amp; Policy Center</span>
            </span>
          </Link>
          <span className="mono" style={{ fontSize: 11, color: 'var(--lg-muted)' }}>Updated {CO.updated}</span>
        </div>
      </header>

      {policy ? <PolicyView id={policyId!} /> : <HubView q={q} setQ={setQ} totalCount={totalCount} />}
    </div>
  );
}

function DraftNote() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 12, padding: '14px 18px', margin: '26px 0 34px' }}>
      <span style={{ fontSize: 17 }}>⚖</span>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--warn-ink)' }}>
        <strong style={{ color: 'var(--warn-ink)' }}>Draft for legal review.</strong> These documents are written to a publishable standard but are templates. They must be reviewed and finalised by an Indian technology lawyer before publication; details marked <span className="doc-body"><span className="tf">like this</span></span> need to be filled in.
      </p>
    </div>
  );
}

function HubView({ q, setQ, totalCount }: { q: string; setQ: (v: string) => void; totalCount: number }) {
  const ql = q.trim().toLowerCase();
  const volumes = VOLUMES.map((v) => ({
    ...v,
    items: v.policies
      .map((pid) => {
        const p = POLICIES[pid];
        return p ? { id: pid, title: p.title, short: p.short, drafted: p.drafted !== false } : null;
      })
      .filter((x): x is { id: string; title: string; short: string; drafted: boolean } => !!x)
      .filter((it) => !ql || it.title.toLowerCase().includes(ql) || it.short.toLowerCase().includes(ql)),
  })).filter((v) => v.items.length);

  return (
    <main style={{ ...shell, padding: '0 28px 90px' }}>
      <section style={{ padding: '56px 0 30px', borderBottom: '1px solid var(--lg-line)' }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--lg-accent)', marginBottom: 16 }}>{CO.company}</div>
        <h1 className="serif" style={{ fontWeight: 600, fontSize: 'clamp(32px,5vw,52px)', lineHeight: 1.08, margin: '0 0 18px', maxWidth: '16ch' }}>The Together City legal &amp; policy library</h1>
        <p style={{ fontSize: 17, color: 'var(--ink-soft)', maxWidth: '62ch', margin: '0 0 26px' }}>Every term, disclaimer, and agreement that governs Together City — a single platform spanning social, dating, AI, medical, nutrition, restaurants, travel, commerce, payments, and the creator economy. Organised into five volumes. Each document is linked below.</p>
        <span className="mono" style={{ fontSize: 12, color: 'var(--lg-muted)' }}>{totalCount} documents · 5 volumes · Governed by Indian law (Mumbai)</span>
      </section>

      <DraftNote />

      <div style={{ position: 'relative', marginBottom: 40, maxWidth: 440 }}>
        <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 15 }}>⌕</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search policies…" aria-label="Search policies"
          style={{ width: '100%', padding: '13px 16px 13px 40px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--card)', fontFamily: 'inherit', fontSize: 15, color: 'var(--lg-ink)', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {volumes.map((vol) => (
        <section key={vol.id} style={{ marginBottom: 46 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
            <span className="serif" style={{ fontWeight: 600, fontSize: 14, color: 'var(--lg-accent)', letterSpacing: '.04em' }}>VOL. {vol.roman}</span>
            <h2 className="serif" style={{ fontWeight: 600, fontSize: 24, margin: 0 }}>{vol.title}</h2>
          </div>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: 15 }}>{vol.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
            {vol.items.map((item) => {
              const pl = pill(item.drafted);
              return (
                <Link key={item.id} to={`/legal/policy/${item.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-2)', padding: '20px 20px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.09em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 'var(--r-3)', background: pl.bg, color: pl.fg }}>{pl.label}</span>
                    <span style={{ color: 'var(--lg-accent)', fontSize: 15 }}>→</span>
                  </div>
                  <span className="serif" style={{ fontWeight: 600, fontSize: 17, color: 'var(--lg-ink)', lineHeight: 1.25 }}>{item.title}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>{item.short}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <footer style={{ borderTop: '1px solid var(--lg-line)', paddingTop: 26, marginTop: 14, color: 'var(--lg-muted)', fontSize: 13, lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 4px' }}><strong style={{ color: 'var(--ink-soft)' }}>{CO.company}</strong> — operator of Together City ({CO.domain}).</p>
        <p style={{ margin: 0 }}>Grievance Officer: {CO.grievanceEmail} · Privacy: {CO.privacyEmail} · Support: {CO.support}</p>
      </footer>
    </main>
  );
}

function PolicyView({ id }: { id: string }) {
  const p = POLICIES[id];
  const vol = VOLUMES.find((v) => v.policies.includes(id));
  const pl = pill(p.drafted !== false);
  const related = (p.related || []).map((rid) => (POLICIES[rid] ? { id: rid, title: POLICIES[rid].title } : null)).filter((x): x is { id: string; title: string } => !!x);

  const scrollTo = (sid: string) => {
    const el = document.getElementById(sid);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
  };

  return (
    <main style={{ ...shell, padding: '34px 28px 90px' }}>
      <Link to="/legal" className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--lg-muted)', marginBottom: 22 }}>← All policies</Link>

      <div className="mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--lg-accent)', marginBottom: 12 }}>Vol. {vol?.roman} · {vol?.title}</div>
      <h1 className="serif" style={{ fontWeight: 600, fontSize: 'clamp(30px,4.6vw,46px)', lineHeight: 1.1, margin: '0 0 14px', maxWidth: '20ch' }}>{p.title}</h1>
      <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--lg-muted)', marginBottom: 26 }}>
        <span>Effective {p.eff}</span>
        <span style={{ padding: '3px 9px', borderRadius: 'var(--r-3)', background: pl.bg, color: pl.fg }}>{pl.label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 11, padding: '13px 16px', marginBottom: 34 }}>
        <span style={{ fontSize: 15 }}>⚖</span>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warn-ink)' }}>Template pending legal review — have Indian legal counsel finalise before publishing.</p>
      </div>

      <div className="legal-grid" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 52, alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 82, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>On this page</span>
          {p.sections.map((s, i) => (
            <a key={i} href={`#sec${i}`} onClick={(e) => { e.preventDefault(); scrollTo(`sec${i}`); }}
              style={{ fontSize: 13, color: 'var(--muted)', padding: '5px 0 5px 12px', lineHeight: 1.4, borderLeft: '2px solid transparent' }}>{s.h}</a>
          ))}
        </nav>

        <article style={{ minWidth: 0, maxWidth: '70ch' }}>
          {p.tldr && p.tldr.length > 0 && (
            <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-2)', padding: '22px 24px', marginBottom: 40 }}>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--lg-accent)', marginBottom: 12 }}>In plain English</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {p.tldr.map((point, i) => <li key={i} style={{ margin: '0 0 8px', color: 'var(--ink-soft)', fontSize: 15, lineHeight: 1.55 }}>{point}</li>)}
              </ul>
            </div>
          )}

          {p.sections.map((s, i) => (
            <section key={i} id={`sec${i}`} style={{ marginBottom: 34, scrollMarginTop: 90 }}>
              <h2 className="serif" style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.3, margin: '0 0 12px' }}>{s.h}</h2>
              <div className="doc-body" dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          ))}

          {related.length > 0 && (
            <div style={{ borderTop: '1px solid var(--lg-line)', paddingTop: 26, marginTop: 44 }}>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>Related documents</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {related.map((r) => (
                  <Link key={r.id} to={`/legal/policy/${r.id}`} style={{ fontSize: 13, padding: '7px 13px', border: '1px solid var(--line)', borderRadius: 'var(--r-3)', color: 'var(--ink-soft)', background: 'var(--card)' }}>{r.title}</Link>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--lg-line)', paddingTop: 24, marginTop: 38, color: 'var(--lg-muted)', fontSize: 13, lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 4px' }}>Questions about this document? {CO.support}</p>
            <p style={{ margin: 0 }}>Complaints &amp; grievances: {CO.grievanceEmail} · {CO.company}</p>
          </div>
        </article>
      </div>
    </main>
  );
}
