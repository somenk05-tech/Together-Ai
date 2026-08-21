import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  useAdminMe, useAdminQueue, useAdminAudit, useDecide,
  useCitizens, useCitizen, useBusinessRecord, useSetSuspended,
  type QueueItem, type CitizenView,
} from '../api';

/**
 * THE CONSOLE, AND IT OPENS ON THE QUEUE.
 *
 * Not on a dashboard of counters. Most of those counters would read zero —
 * orders, revenue and payouts belong to features that do not exist — and a
 * screen of zeros is an invitation to seed it with fictions.
 *
 * It opens instead on the one thing with a person waiting at the other end:
 * listings sitting at 'pending', which until now nothing anywhere surfaced. A
 * citizen filled in the whole form and has been looking at "not live yet" ever
 * since.
 *
 * WHAT IS SHOWN IS DECIDED BY THE SERVER. The screen hides controls this
 * person cannot use, which is a courtesy — the guard is what actually stops
 * them, and it reads the grants table on every request.
 */
function Row({ item, canApprove, canSuspend }: { item: QueueItem; canApprove: boolean; canSuspend: boolean }) {
  const decide = useDecide();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;

  const act = (decision: 'approved' | 'rejected' | 'removed') => {
    setErr(null);
    decide.mutate({ id: item.id, decision, reason: reason.trim() }, {
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That decision could not be recorded.');
      },
    });
  };

  return (
    <Card style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {item.photos[0] && (
          <img src={item.photos[0]} alt="" width={84} height={64}
            style={{ objectFit: 'cover', borderRadius: 'var(--r-1)', border: '1px solid var(--line)' }} />
        )}
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <strong style={{ fontSize: 16 }}>{item.businessName}</strong>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {item.categoryKey} · {item.areas.length ? item.areas.join(' · ') : item.city}
          </div>
          {item.owner && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {item.owner.name} · @{item.owner.handle}
            </div>
          )}
        </div>
        {/* The number this queue is about. Emphasised past a day, because that
            is when somebody has been waiting rather than just arrived. */}
        <span style={{
          fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          color: item.waitingHours >= 24 ? 'var(--danger-ink)' : 'var(--muted)',
        }}>
          waiting {item.waitingHours < 24 ? `${item.waitingHours}h` : `${Math.floor(item.waitingHours / 24)}d`}
        </span>
      </div>

      {item.about && <p style={{ fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' }}>{item.about}</p>}

      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
        aria-label={`Reason for your decision on ${item.businessName}`}
        placeholder="Why? One sentence — the owner may ask, and a week later nobody remembers."
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)',
          borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' }} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canApprove && (
          <>
            <Button variant="accent" size="sm" disabled={!ready || decide.isPending} onClick={() => act('approved')}>
              {decide.isPending ? 'Recording…' : 'Approve'}
            </Button>
            <Button variant="line" size="sm" disabled={!ready || decide.isPending} onClick={() => act('rejected')}>Reject</Button>
          </>
        )}
        {canSuspend && (
          <Button variant="line" size="sm" disabled={!ready || decide.isPending} onClick={() => act('removed')}>Remove</Button>
        )}
        {!ready && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>A reason is required.</span>}
      </div>
      {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
    </Card>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */

const dt = (v: string) => new Date(v).toLocaleString();

/** A status word, in the status colour it has earned. Never a bare dot: a
 *  colour-only state is unreadable to a good fraction of any team. */
function Status({ status }: { status: CitizenView['status'] }) {
  const tone = status === 'live' ? 'var(--ok-ink)'
    : status === 'suspended' ? 'var(--danger-ink)'
    : 'var(--muted)';
  return <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: tone }}>{status}</span>;
}

/** The trail, used by both record panels. Console actions, newest first. */
function History({ items }: { items: Array<{ id: string; action: string; reason: string; at: string; actor: { name: string; handle: string } | null }> }) {
  if (!items.length) return <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nothing has been done to this record through the console.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((h) => (
        <div key={h.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{h.action}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {h.actor ? `${h.actor.name} (@${h.actor.handle})` : 'unknown'} · {dt(h.at)}
          </div>
          {h.reason && <p style={{ fontSize: 13, margin: '3px 0 0' }}>{h.reason}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── the citizen record ─────────────────────────── */

/**
 * ONE PERSON, AND WHAT THIS CONSOLE LEGITIMATELY KNOWS ABOUT THEM.
 *
 * The contact details arrive masked and there is no way to ask for them
 * unmasked — that is decided on the server, in citizen-view.ts, and the line
 * under them says so out loud. A screen that quietly showed a mask would
 * invite the next person to add an "unmask" button; a screen that explains it
 * makes them read the reason first.
 */
function CitizenRecordPanel({ id, canSuspend, onOpenBusiness, onClose }: {
  id: string; canSuspend: boolean;
  onOpenBusiness: (listingId: string) => void;
  onClose: () => void;
}) {
  const rec = useCitizen(id);
  const setSusp = useSetSuspended();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ready = reason.trim().length >= 8;

  // A reason written for one person must not follow you to the next.
  useEffect(() => { setReason(''); setErr(null); }, [id]);

  if (rec.isLoading) return <Card><Spinner label="Opening the record…" /></Card>;
  if (rec.isError || !rec.data) return <Card><EmptyState title="Couldn't open that record" hint="It may have been deleted." /></Card>;

  const c = rec.data.citizen;
  const suspended = c.status === 'suspended';
  const act = () => {
    setErr(null);
    setSusp.mutate({ id, suspended: !suspended, reason: reason.trim() }, {
      onSuccess: () => setReason(''),
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be recorded.');
      },
    });
  };

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
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {c.city ? `${c.city} · ` : ''}joined {new Date(c.joinedAt).toLocaleDateString()} · last seen {dt(c.lastSeen)}
          </div>
        </div>
        <Button variant="line" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div>
        <div style={{ fontSize: 13 }}>
          {c.email ?? '— no email'} {c.emailVerified && <span className="muted">· verified</span>}
        </div>
        <div style={{ fontSize: 13 }}>
          {c.phone ?? '— no phone'} {c.phoneVerified && <span className="muted">· verified</span>}
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '5px 0 0', maxWidth: '58ch' }}>
          Masked on purpose, and there is no unmasked view to open. Enough to confirm an account
          somebody wrote to you about; not enough to contact them with a detail they gave us for receipts.
        </p>
      </div>

      {suspended && c.suspendedReason && (
        <div style={{ border: '1px solid var(--danger-line)', background: 'var(--danger-soft)', borderRadius: 'var(--r-1)', padding: '10px 13px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--danger-ink)' }}>Suspended</div>
          <p style={{ fontSize: 13, margin: '4px 0 0' }}>{c.suspendedReason}</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Listings ({rec.data.listings.length})</h3>
        {rec.data.listings.length === 0
          ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>None.</p>
          : rec.data.listings.map((l) => (
            <button key={l.id} type="button" onClick={() => onOpenBusiness(l.id)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', textAlign: 'left', width: '100%',
                minHeight: 44, background: 'none', border: 0, borderBottom: '1px solid var(--line)',
                padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
              <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{l.businessName}</span>
              <span className="muted" style={{ fontSize: 12 }}>{l.categoryKey} · {l.moderation}</span>
            </button>
          ))}
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
        <span>Reports filed by them: <strong>{rec.data.reportsMade}</strong></span>
        <span>Reports about them: <strong>{rec.data.reportsAbout.length}</strong></span>
      </div>
      {rec.data.reportsAbout.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {rec.data.reportsAbout.map((r) => (
            <div key={r.id} style={{ fontSize: 13 }}>
              <span className="muted">{new Date(r.createdAt).toLocaleDateString()} · {r.status} · </span>
              {r.reason ?? 'no reason given'}
            </div>
          ))}
        </div>
      )}

      {canSuspend && c.status !== 'deleted' && c.status !== 'purged' && (
        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
            aria-label={`Reason for ${suspended ? 'restoring' : 'suspending'} ${c.name}`}
            placeholder={suspended
              ? 'Why are you giving this account back? One sentence.'
              : 'Why is this account being suspended? One sentence — the next admin reads this.'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)',
              borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant={suspended ? 'accent' : 'line'} size="sm" disabled={!ready || setSusp.isPending} onClick={act}>
              {setSusp.isPending ? 'Recording…' : suspended ? 'Restore this account' : 'Suspend this account'}
            </Button>
            {!ready && <span className="muted" style={{ fontSize: 12 }}>A reason is required.</span>}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: 0, maxWidth: '62ch' }}>
            Suspending signs them out on their next request and refuses new sign-ins. Nothing is deleted,
            and restoring is one click — the evidence for a suspension is the data, so it stays.
          </p>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>What has been done to this account</h3>
        <History items={rec.data.history} />
      </div>
    </Card>
  );
}

/* ─────────────────────────── the business record ─────────────────────────── */

/**
 * The queue can approve and reject a listing while showing almost nothing to
 * decide on. This is what a decision actually needs — including the automated
 * pass's own verdict, printed verbatim rather than summarised, because a
 * summary here would be this screen's opinion of another module's output.
 */
function BusinessRecordPanel({ id, onOpenCitizen, onClose }: {
  id: string; onOpenCitizen: (userId: string) => void; onClose: () => void;
}) {
  const rec = useBusinessRecord(id);
  if (rec.isLoading) return <Card><Spinner label="Opening the record…" /></Card>;
  if (rec.isError || !rec.data) return <Card><EmptyState title="Couldn't open that listing" hint="It may have been removed." /></Card>;
  const { listing: l, owner } = rec.data;

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <strong style={{ fontSize: 17 }}>{l.businessName}</strong>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            {l.categoryKey} · {l.areas.length ? l.areas.join(' · ') : l.city} · {l.moderation}
            {l.slug && <> · /services/{l.slug}</>}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            listed {new Date(l.createdAt).toLocaleDateString()} · {l.reviewCount} review{l.reviewCount === 1 ? '' : 's'}
          </div>
        </div>
        <Button variant="line" size="sm" onClick={onClose}>Close</Button>
      </div>

      {l.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {l.photos.map((src) => (
            <img key={src} src={src} alt="" width={110} height={82}
              style={{ objectFit: 'cover', borderRadius: 'var(--r-1)', border: '1px solid var(--line)', flex: '0 0 auto' }} />
          ))}
        </div>
      )}
      {l.about && <p style={{ fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' }}>{l.about}</p>}

      {owner && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Owner</h3>
          <button type="button" onClick={() => onOpenCitizen(owner.id)}
            style={{ display: 'flex', gap: 10, alignItems: 'baseline', minHeight: 44, background: 'none',
              border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{owner.name}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>@{owner.handle}</span>
            <Status status={owner.status} />
          </button>
          {rec.data.alsoOwns.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              Also owns: {rec.data.alsoOwns.map((o) => `${o.businessName} (${o.moderation})`).join(', ')}
            </p>
          )}
        </div>
      )}

      {rec.data.autoModeration && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>What the automated pass decided</h3>
          <pre style={{ fontSize: 11.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: 'var(--wash)', borderRadius: 8, padding: 10 }}>{rec.data.autoModeration}</pre>
        </div>
      )}

      {rec.data.moderationLog.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Moderation log</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {rec.data.moderationLog.map((m) => (
              <div key={m.id} style={{ fontSize: 13 }}>
                <span className="muted">{dt(m.at)} · {m.actor} · </span>{m.decision}
                {m.reason && <span className="muted"> — {m.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>What has been done to this listing</h3>
        <History items={rec.data.history} />
      </div>
    </Card>
  );
}

/* ─────────────────────────── finding somebody ─────────────────────────── */

/**
 * The search runs on handle, name AND id — because half of what an admin has
 * in front of them is an id copied out of an audit row or an error report, and
 * a search that cannot take one sends them to the database.
 *
 * It does not run on an empty box. A console that lists every citizen by
 * default is a console whose first screen is a directory of everybody, which
 * is a different product from the one that answers a question about a person.
 */
function Citizens({ canSuspend, onOpenBusiness }: { canSuspend: boolean; onOpenBusiness: (id: string) => void }) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Debounced, so a five-letter handle is one query rather than five.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useCitizens(true, { q, status: status || undefined });
  const asked = Boolean(q || status);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={120}
          aria-label="Find a citizen by handle, name or id"
          placeholder="Handle, name, or an id from the audit log"
          style={{ flex: '1 1 260px', boxSizing: 'border-box', padding: '10px 12px',
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

      {!asked && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Search to find somebody.</p>
      )}
      {asked && list.isLoading && <Spinner label="Searching…" />}
      {asked && list.data && list.data.items.length === 0 && (
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
        <CitizenRecordPanel id={openId} canSuspend={canSuspend}
          onOpenBusiness={onOpenBusiness} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

type Tab = 'queue' | 'citizens' | 'audit';

const HEADING: Record<Tab, { title: string; lede: string }> = {
  queue: {
    title: 'Waiting on a decision',
    lede: 'Oldest first — a queue sorted newest-first starves its own tail, and the listing '
      + 'nobody got to on Monday belongs to the person who has been waiting longest.',
  },
  citizens: {
    title: 'Find a person',
    lede: 'By handle, by name, or by an id copied out of the audit log. There is no list of '
      + 'everybody — a console that opens on a directory of every citizen is a different '
      + 'thing from one that answers a question about a person.',
  },
  audit: {
    title: 'What has been done',
    lede: 'Every action taken through this console, newest first, with the reason its author '
      + 'gave at the time.',
  },
};

export function AdminConsole() {
  const me = useAdminMe();
  const has = (k: string) => (me.data?.permissions ?? []).some((p) => p.key === k);
  const [tab, setTab] = useState<Tab>('queue');
  // Opened from a citizen's listings or from the queue. Kept at this level so
  // that following owner → listing → owner does not nest panels inside panels.
  const [businessId, setBusinessId] = useState<string | null>(null);
  const queue = useAdminQueue(has('business.read') && tab === 'queue');
  const audit = useAdminAudit(has('audit.read') && tab === 'audit');

  if (me.isLoading) return <Spinner label="Checking what you can do…" />;
  // No roles is not an error. It is the correct answer for almost everybody,
  // and it should read like one rather than like something broke.
  if (me.isError || !me.data || me.data.roles.length === 0) {
    return (
      <EmptyState title="The console is not open to this account"
        hint="Admin roles are granted one at a time and recorded. If you should have one, ask somebody who can grant it." />
    );
  }

  return (
    <div className="page">
      <div className="eyebrow">Together City · Console</div>
      {/* The heading belongs to the TAB, not to the console. It said "Waiting
          on a decision" over the citizen search for one render and read as a
          page that had not noticed you navigated. */}
      <h1 style={{ fontSize: 26 }}>{HEADING[tab].title}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 4px', maxWidth: '64ch' }}>
        {HEADING[tab].lede}
      </p>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>
        Signed in as <strong>{me.data.roles.join(', ')}</strong>. Every decision below is recorded
        with your name, the reason you give, and what changed.
      </p>

      {/* Tabs, and each one is hidden when the permission is missing rather
          than shown-and-refused. A tab that always 403s teaches people to
          ignore the console's own error messages. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
        {(
          [
            ['queue', 'Queue', has('business.read')],
            ['citizens', 'Citizens', has('users.read')],
            ['audit', 'Audit', has('audit.read')],
          ] as Array<[Tab, string, boolean]>
        ).filter(([, , allowed]) => allowed).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setTab(k); setBusinessId(null); }}
            aria-current={tab === k ? 'page' : undefined}
            style={{ position: 'relative', minHeight: 44, padding: '0 14px', border: 0, background: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--accent-ink)' : 'var(--muted)' }}>
            {label}
            {tab === k && <span style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, background: 'var(--accent-ink)' }} />}
          </button>
        ))}
      </div>

      {/* A listing opened from anywhere renders above whatever tab you are on,
          so the trail back to the tab is never lost. */}
      {businessId && (
        <div style={{ marginBottom: 16 }}>
          <BusinessRecordPanel id={businessId}
            onOpenCitizen={() => { setTab('citizens'); setBusinessId(null); }}
            onClose={() => setBusinessId(null)} />
        </div>
      )}

      {tab === 'citizens' && (
        <Citizens canSuspend={has('users.suspend')} onOpenBusiness={setBusinessId} />
      )}

      {tab === 'queue' && <>
      {queue.isLoading && <Spinner label="Loading the queue…" />}
      {queue.isError && <EmptyState title="Couldn't load the queue" hint="Try again in a moment." />}
      {queue.data && queue.data.items.length === 0 && (
        <EmptyState title="Nothing is waiting" hint="Every listing has been decided. This is the state to keep it in." />
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {(queue.data?.items ?? []).map((it) => (
          <div key={it.id} style={{ display: 'grid', gap: 4 }}>
            <Row item={it} canApprove={has('business.approve')} canSuspend={has('business.suspend')} />
            <button type="button" onClick={() => setBusinessId(it.id)}
              style={{ justifySelf: 'start', minHeight: 44, background: 'none', border: 0, padding: '0 2px',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
              Open the full record →
            </button>
          </div>
        ))}
      </div>
      </>}

      {tab === 'audit' && has('audit.read') && (
        <div>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>What has been done</h2>
          {audit.isLoading && <Spinner label="Loading the log…" />}
          {audit.data && audit.data.items.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>Nothing has been done through the console yet.</p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {(audit.data?.items ?? []).map((a) => (
              <div key={a.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {a.action} <span className="muted" style={{ fontWeight: 400 }}>· {a.entity}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {a.actor ? `${a.actor.name} (@${a.actor.handle})` : 'unknown'} · {new Date(a.at).toLocaleString()}
                </div>
                {a.reason && <p style={{ fontSize: 13, margin: '3px 0 0' }}>{a.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
