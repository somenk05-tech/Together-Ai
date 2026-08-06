import { useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useAdminMe, useAdminQueue, useAdminAudit, useDecide, type QueueItem } from '../api';

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
            style={{ objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
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
          borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' }} />

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

export function AdminConsole() {
  const me = useAdminMe();
  const has = (k: string) => (me.data?.permissions ?? []).some((p) => p.key === k);
  const queue = useAdminQueue(has('business.read'));
  const audit = useAdminAudit(has('audit.read'));

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
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Together City · Console</div>
      <h1 style={{ fontSize: 26 }}>Waiting on a decision</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 4px', maxWidth: '64ch' }}>
        Oldest first — a queue sorted newest-first starves its own tail, and the listing nobody
        got to on Monday belongs to the person who has been waiting longest.
      </p>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>
        Signed in as <strong>{me.data.roles.join(', ')}</strong>. Every decision below is recorded
        with your name, the reason you give, and what changed.
      </p>

      {queue.isLoading && <Spinner label="Loading the queue…" />}
      {queue.isError && <EmptyState title="Couldn't load the queue" hint="Try again in a moment." />}
      {queue.data && queue.data.items.length === 0 && (
        <EmptyState title="Nothing is waiting" hint="Every listing has been decided. This is the state to keep it in." />
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {(queue.data?.items ?? []).map((it) => (
          <Row key={it.id} item={it} canApprove={has('business.approve')} canSuspend={has('business.suspend')} />
        ))}
      </div>

      {has('audit.read') && (
        <div style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>What has been done</h2>
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
