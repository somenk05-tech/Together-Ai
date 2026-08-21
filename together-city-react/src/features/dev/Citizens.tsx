import { useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  adminApi, useAdminMe, useCitizens, useCitizen, useCitizenActivity, useSetSuspended,
  type CitizenView,
} from '@/features/admin/api';

/**
 * USER RECORDS ON THE DEVELOPER PAGE.
 *
 * Asked for as "all the data of users like userdetails in the developer page",
 * and this is that — with one thing kept from the page it sits on.
 *
 * THE PASSWORD OPENS THE PAGE. THE GRANT OPENS THE PEOPLE. Every request below
 * goes to the ADMIN console's own endpoints, which check `users.read` from the
 * grants table on every request. That is deliberate and it is the whole reason
 * this file is short: there is one implementation of what a console may know
 * about a person (citizen-view.ts on the API), one set of guards over it, and
 * this screen is a second window onto it rather than a second copy of it.
 *
 * The practical difference: a leaked password shows nobody. The person reading
 * a citizen's record is a named account, so "who looked at this" has an answer
 * — which "whoever knew the password" never can.
 *
 * REVEALING A REAL EMAIL OR PHONE IS A SEPARATE ACT. It needs `users.contact`,
 * which only founder and superadmin hold, it writes an audit row every time,
 * and the panel looks different while it is showing one. A screen that renders
 * a mask and a real address identically is a screen that gets screenshotted.
 */

const dt = (v: string) => new Date(v).toLocaleString();
const day = (v: string) => new Date(v).toLocaleDateString();

function Status({ status }: { status: CitizenView['status'] }) {
  const tone = status === 'live' ? 'var(--ok-ink)'
    : status === 'suspended' ? 'var(--danger-ink)'
    : 'var(--muted)';
  return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: tone }}>{status}</span>;
}

/* ─────────────────────────── one record ─────────────────────────── */

function Record({ id, canSuspend, canReveal, onClose }: {
  id: string; canSuspend: boolean; canReveal: boolean; onClose: () => void;
}) {
  const [reveal, setReveal] = useState<{ on: boolean; reason: string }>({ on: false, reason: '' });
  const [revealReason, setRevealReason] = useState('');
  const [arming, setArming] = useState(false);
  const rec = useCitizen(id, reveal);
  const act = useCitizenActivity(id);
  const setSusp = useSetSuspended();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;

  // A reveal, a reason and an armed control must not follow you to the next
  // person. Everything resets when the record does.
  useEffect(() => {
    setReveal({ on: false, reason: '' });
    setRevealReason(''); setArming(false); setReason(''); setErr(null);
  }, [id]);

  if (rec.isLoading) return <Card><Spinner label="Opening the record…" /></Card>;
  if (rec.isError || !rec.data) {
    return <Card><EmptyState title="Couldn't open that record"
      hint="Either it is gone, or this account does not hold the users.read permission." /></Card>;
  }

  const c = rec.data.citizen;
  const suspended = c.status === 'suspended';
  const flip = () => {
    setErr(null);
    setSusp.mutate({ id, suspended: !suspended, reason: reason.trim() }, {
      onSuccess: () => { setReason(''); void rec.refetch(); },
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be recorded.');
      },
    });
  };

  const Line = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
      <span className="muted" style={{ flex: '0 0 150px' }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{v}</span>
    </div>
  );

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 17 }}>{c.name}</strong>
            <span className="muted" style={{ fontSize: 13 }}>@{c.handle}</span>
            <Status status={c.status} />
            {c.moderator && <span className="tag">moderator</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3, fontFamily: 'ui-monospace, monospace' }}>{c.id}</div>
        </div>
        <Button variant="line" size="sm" onClick={onClose}>Close</Button>
      </div>

      {/* ── identity ── */}
      <div>
        <Line k="City" v={c.city ?? <span className="muted">not set</span>} />
        <Line k="Joined" v={day(c.joinedAt)} />
        <Line k="Last seen" v={dt(c.lastSeen)} />
        <Line k="Email" v={<>
          {c.email ?? <span className="muted">none</span>}
          {c.emailVerified ? <span className="muted"> · verified</span> : <span className="muted"> · unverified</span>}
        </>} />
        <Line k="Phone" v={<>
          {c.phone ?? <span className="muted">none</span>}
          {c.phoneVerified ? <span className="muted"> · verified</span> : ''}
        </>} />
      </div>

      {/* ── the reveal ── */}
      {c.contactRevealed ? (
        <div style={{ border: '1px solid var(--warn-line)', background: 'var(--warn-soft)',
          borderRadius: 'var(--r-1)', padding: '10px 13px' }}>
          <strong style={{ fontSize: 12.5 }}>Showing this person’s real email and phone number.</strong>
          <p style={{ fontSize: 12, margin: '3px 0 8px', lineHeight: 1.5 }}>
            That was recorded in the audit log against your account, with the reason you gave.
            It goes back to masked when you close this record.
          </p>
          <Button variant="line" size="sm" onClick={() => { setReveal({ on: false, reason: '' }); setRevealReason(''); }}>
            Hide again
          </Button>
        </div>
      ) : canReveal ? (
        arming ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={revealReason} onChange={(e) => setRevealReason(e.target.value)} maxLength={500}
              aria-label={`Reason for revealing ${c.name}'s contact details`}
              placeholder="Why do you need their real email or number? This is written to the audit log."
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
                border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5,
                fontFamily: 'inherit', background: 'var(--card)' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="accent" size="sm" disabled={revealReason.trim().length < 8}
                onClick={() => { setReveal({ on: true, reason: revealReason.trim() }); setArming(false); }}>
                Reveal and record
              </Button>
              <Button variant="line" size="sm" onClick={() => { setArming(false); setRevealReason(''); }}>Cancel</Button>
              {revealReason.trim().length < 8 && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
            </div>
          </div>
        ) : (
          <Button variant="line" size="sm" onClick={() => setArming(true)}>Reveal real email and phone</Button>
        )
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Contact details are masked. Revealing them needs the <code>users.contact</code> permission,
          which only founder and superadmin hold.
        </p>
      )}

      {/* ── what they use ── */}
      <div>
        <h3 style={{ fontSize: 13, margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>What they use</h3>
        {act.isLoading && <Spinner label="Counting…" />}
        {act.data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {Object.entries(act.data.profiles).map(([hub, has]) => (
                <span key={hub} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 'var(--r-full)',
                  border: '1px solid var(--line)',
                  background: has ? 'var(--ok-soft)' : 'transparent',
                  color: has ? 'var(--ok-ink)' : 'var(--muted)' }}>
                  {hub}{has ? '' : ' — none'}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px 18px' }}>
              {Object.entries(act.data.counts).map(([k, n]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8,
                  fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                  <span className="muted">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0', maxWidth: '62ch' }}>
              Whether a hub has been used and how much — never what is in it. The distance between
              “has a medical record” and what that record says is the distance between an admin tool
              and a health data breach.
            </p>
          </>
        )}
      </div>

      {/* ── sessions ── */}
      {act.data && (
        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Sessions</h3>
          <Line k="Signed-in devices" v={act.data.sessions.activeSessions} />
          <Line k="Push devices" v={act.data.sessions.pushDevices} />
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0', maxWidth: '62ch' }}>
            No IP addresses. They are recorded so a compromised account can be traced by somebody
            with database access; a screen that lists them is a map of where people live.
          </p>
        </div>
      )}

      {/* ── listings and reports ── */}
      {rec.data.listings.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 4px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Listings ({rec.data.listings.length})
          </h3>
          {rec.data.listings.map((l) => (
            <Line key={l.id} k={l.categoryKey} v={<>{l.businessName} <span className="muted">· {l.moderation}</span></>} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
        <span>Reports filed by them: <strong>{rec.data.reportsMade}</strong></span>
        <span>Reports about them: <strong>{rec.data.reportsAbout.length}</strong></span>
      </div>

      {/* ── suspend ── */}
      {canSuspend && c.status !== 'deleted' && c.status !== 'purged' && (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {suspended && c.suspendedReason && (
            <p style={{ fontSize: 12.5, margin: 0, color: 'var(--danger-ink)' }}>Suspended: {c.suspendedReason}</p>
          )}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
            aria-label={`Reason for ${suspended ? 'restoring' : 'suspending'} ${c.name}`}
            placeholder={suspended ? 'Why is this account coming back?' : 'Why is this account being suspended?'}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
              border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5,
              fontFamily: 'inherit', background: 'var(--card)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant={suspended ? 'accent' : 'line'} size="sm" disabled={!ready || setSusp.isPending} onClick={flip}>
              {setSusp.isPending ? 'Recording…' : suspended ? 'Restore this account' : 'Suspend this account'}
            </Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
        </div>
      )}

      {/* ── history ── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          What has been done to this account
        </h3>
        {rec.data.history.length === 0
          ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nothing yet.</p>
          : rec.data.history.map((h) => (
            <div key={h.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{h.action}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {h.actor ? `${h.actor.name} (@${h.actor.handle})` : 'unknown'} · {dt(h.at)}
              </div>
              {h.reason && <p style={{ fontSize: 13, margin: '3px 0 0' }}>{h.reason}</p>}
            </div>
          ))}
      </div>
    </Card>
  );
}

/* ─────────────────────────── the tab ─────────────────────────── */

export function DevCitizens() {
  const me = useAdminMe();
  const has = (k: string) => (me.data?.permissions ?? []).some((p) => p.key === k);

  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportReason, setExportReason] = useState('');
  const [arming, setArming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useCitizens(true, { q, status: status || undefined });
  const asked = useMemo(() => Boolean(q || status), [q, status]);

  if (me.isLoading) return <Spinner label="Checking what you can do…" />;
  if (!has('users.read')) {
    return (
      <EmptyState title="This account cannot read citizen records"
        hint="The password opens this page; the users.read permission opens the people. Ask somebody who can grant it — or set CONSOLE_FOUNDERS and redeploy if this is a new deployment." />
    );
  }

  /**
   * The export builds the file in the browser from a string the server made.
   * The server never sends a Content-Disposition, so nothing about this can
   * happen by following a link — which matters because a GET that downloads
   * the user table is a GET somebody can put in an <img> tag.
   */
  const runExport = () => {
    setExporting(true); setNote(null);
    adminApi.exportCitizens(exportReason.trim())
      .then((r) => {
        const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `together-city-citizens-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setNote(`${r.rows} rows. Contact details are masked in the file — a spreadsheet outlives the decision to make it.`);
        setArming(false); setExportReason('');
      })
      .catch(() => setNote('That export could not be made.'))
      .finally(() => setExporting(false));
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={120}
          aria-label="Find a citizen by handle, name or id"
          placeholder="Handle, name, or an id from the audit log"
          style={{ flex: '1 1 240px', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
            border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5,
            fontFamily: 'inherit', background: 'var(--card)' }} />
        {([['', 'Any'], ['suspended', 'Suspended'], ['deleted', 'Closed']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatus(k)}
            style={{ minHeight: 44, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-1)',
              border: `1.5px solid ${status === k ? 'var(--accent-ink)' : 'var(--line)'}`,
              background: status === k ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--ink)' }}>
            {label}
          </button>
        ))}
      </div>

      {!asked && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Search to find somebody.</p>}
      {asked && list.isLoading && <Spinner label="Searching…" />}
      {asked && list.data?.items.length === 0 && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nobody matches that.</p>
      )}
      {list.data && list.data.items.length > 0 && (
        <div style={{ display: 'grid', gap: 2 }}>
          {list.data.items.map((c) => (
            <button key={c.id} type="button" onClick={() => setOpenId(c.id === openId ? null : c.id)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', textAlign: 'left', width: '100%',
                minHeight: 44, background: c.id === openId ? 'var(--accent-soft)' : 'none', border: 0,
                borderBottom: '1px solid var(--line)', padding: '8px 10px', cursor: 'pointer',
                fontFamily: 'inherit', color: 'inherit' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>@{c.handle}</span>
              <Status status={c.status} />
            </button>
          ))}
          {list.data.truncated && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Showing the first {list.data.limit}. Narrow the search — this is not all of them.
            </p>
          )}
        </div>
      )}

      {openId && (
        <Record id={openId} canSuspend={has('users.suspend')} canReveal={has('users.contact')}
          onClose={() => setOpenId(null)} />
      )}

      {/* ── export ── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        {arming ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={exportReason} onChange={(e) => setExportReason(e.target.value)} maxLength={500}
              aria-label="Reason for exporting the citizen list"
              placeholder="Why is the whole list being exported? This is written to the audit log."
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
                border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5,
                fontFamily: 'inherit', background: 'var(--card)' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="accent" size="sm" disabled={exportReason.trim().length < 8 || exporting} onClick={runExport}>
                {exporting ? 'Building…' : 'Download the CSV'}
              </Button>
              <Button variant="line" size="sm" onClick={() => { setArming(false); setExportReason(''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="line" size="sm" onClick={() => setArming(true)}>Export every citizen as CSV</Button>
        )}
        {note && <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{note}</p>}
        <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0', maxWidth: '64ch' }}>
          The file carries the same fields as the screen, with contact details masked whatever you
          hold. Revealing one record is a considered act; a spreadsheet with fourteen thousand real
          addresses in it lands in a Downloads folder and is still there in two years.
        </p>
      </div>
    </div>
  );
}
