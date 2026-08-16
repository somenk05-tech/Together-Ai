import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useConnections, useRespondConnection, chatApi } from '@/api';
import type { Connection } from '@/api/schemas';
import { MemberFinder } from '../components/MemberFinder';
import { useHubs, useRemoveConnection, useUpdateModules } from '@/api/connections.api';
import { DEFAULT_MODULES, RELATIONSHIPS, allowedModules, optionalOf } from '../modules';
import { ModuleChips, ModuleToggles } from '../components/ModuleToggles';

function Avatar({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
        background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15,
      }}
    >
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

function Row({ c, actions, subtitle, children, collapsible, expanded, onToggle, chipCaption }: {
  c: Connection; actions?: React.ReactNode; subtitle?: string; children?: React.ReactNode;
  /** Overrides the chip caption. A pending row is describing a proposal, not a
   *  state — see ModuleChips. */
  chipCaption?: string;
  /** When set, the connected-hubs are collapsed by default and toggled by `onToggle`. */
  collapsible?: boolean; expanded?: boolean; onToggle?: () => void;
}) {
  // The hub list comes from the server's registry, not from a copy kept here.
  const { data: hubs } = useHubs();
  const hubCount = optionalOf(hubs, c.modules ?? DEFAULT_MODULES).length;
  // Reduced motion keeps the fade and drops the height leg.
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <div className="person-row">
        <Avatar name={c.user.name} />
        <div className="person-id">
          <div className="person-name">{c.user.name}</div>
          <div className="person-sub muted">@{c.user.handle}{subtitle ? ` · ${subtitle}` : ''}</div>
          {/* Collapsed: a compact "N hubs" toggle. Expanded (or non-collapsible): full chips. */}
          {hubCount === 0 ? null : collapsible ? (
            <>
              <button type="button" className="person-hubs" onClick={onToggle} aria-expanded={expanded}>
                <span aria-hidden className="person-hubs-caret">▸</span>
                {expanded ? 'Hide' : `${hubCount} connected hub${hubCount > 1 ? 's' : ''}`}
              </button>
              {/* The caret was already rotating; the chips it reveals were not
                  moving at all. Same 1fr -> 0fr row as .tc-msg-collapse, with
                  the chips' own spacing inside the overflow:hidden row. */}
              <div style={{
                display: 'grid',
                gridTemplateRows: expanded ? '1fr' : '0fr',
                opacity: expanded ? 1 : 0,
                transition: reduce
                  ? 'opacity var(--dur-fast) linear'
                  : 'grid-template-rows var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
              }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <ModuleChips modules={c.modules ?? DEFAULT_MODULES} caption={chipCaption} />
                </div>
              </div>
            </>
          ) : (
            <ModuleChips modules={c.modules ?? DEFAULT_MODULES} caption={chipCaption} />
          )}
        </div>
        {actions && <div className="person-acts">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

const relLabel = (r?: string | null) => RELATIONSHIPS.find((x) => x.key === r)?.label ?? null;

/** Manage a connection — change relationship, toggle hub modules, save.
 *  The ONE record every hub queries updates everywhere immediately. */
function ManagePanel({ c, onDone }: { c: Connection; onDone: () => void }) {
  const update = useUpdateModules();
  const { data: hubs } = useHubs();
  const [rel, setRel] = useState<string>(c.relationship ?? 'friend');
  const [selected, setSelected] = useState<string[]>((c.modules ?? DEFAULT_MODULES));
  return (
    <div className="person-fold">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {RELATIONSHIPS.map((r) => (
          <button key={r.key} type="button"
            onClick={() => { setRel(r.key); setSelected((m) => m.filter((k) => allowedModules(hubs, r.key).includes(k))); }}
            style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 14px',
              borderRadius: 9, border: `1.5px solid ${rel === r.key ? 'var(--accent)' : 'var(--line)'}`,
              background: rel === r.key ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--ink)' }}>
            {r.emoji} {r.label}
          </button>
        ))}
      </div>
      <ModuleToggles relationship={rel} selected={selected.filter((k) => allowedModules(hubs, rel).includes(k))} onChange={setSelected} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <Button size="sm" variant="accent" disabled={update.isPending}
          onClick={() => update.mutate({ id: c.id, modules: selected, relationship: rel }, { onSuccess: onDone })}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <span className="muted" style={{ fontSize: 11 }}>Connected hubs update everywhere immediately.</span>
      </div>
    </div>
  );
}

/** Remove confirmation — disconnects the person from ALL shared hubs. */
function RemoveConfirm({ c, onCancel }: { c: Connection; onCancel: () => void }) {
  const remove = useRemoveConnection();
  return (
    <div className="person-fold">
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(192,57,43,.06)', border: '1px solid rgba(192,57,43,.25)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Remove {c.user.name.split(' ')[0]} from your connections?</p>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>This will disconnect them from all shared hubs.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="line" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="accent" disabled={remove.isPending}
            onClick={() => remove.mutate(c.id, { onSuccess: onCancel })}>
            {remove.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Social connections — find people, respond to requests, and see everyone you're connected to. */
export function Connections() {
  const all = useConnections();
  const respond = useRespondConnection();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openChat = async (h: string) => {
    setOpening(h);
    try {
      const conv = await chatApi.startDirect(h);
      await qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      navigate(`/chats?c=${conv.id}`);
    } finally { setOpening(null); }
  };

  if (all.isLoading) return <Spinner label="Loading your connections…" />;
  if (all.isError) return <EmptyState title="Couldn't load connections" hint="Your connections are unchanged — nobody has been added or removed. We couldn’t read them just now." />;

  const incoming = (all.data ?? []).filter((c) => c.status === 'pending' && c.incoming);
  const outgoing = (all.data ?? []).filter((c) => c.status === 'pending' && !c.incoming);
  const accepted = (all.data ?? []).filter((c) => c.status === 'accepted');

  return (
    <div className="page">
      <div className="eyebrow">Together City · People</div>
      <h1 style={{ fontSize: 26 }}>People</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        The universal connection center. Connect once, choose the hubs to share — every hub across the
        city simply shows Connected or Not Connected from this one place.
      </p>

      <MemberFinder />

      {incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="eyebrow">Requests for you · {incoming.length}</div>
          {/* The sender chose the relationship and the hubs, and this screen is
              not where they get changed — that is the owner's decision, and it
              is a defensible one. What it makes necessary is saying so, and
              saying when it DOES become changeable. Accepting is otherwise a
              button that opens hubs somebody else picked with no indication
              that the choice can be revisited. */}
          <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.55 }}>
            They chose which hubs to ask for. Accepting opens exactly those &mdash; you can change
            them, or disconnect, any time afterwards.
          </p>
          {incoming.map((c) => (
            <Row
              key={c.id}
              c={c}
              subtitle={relLabel(c.relationship) ? `wants to connect with you as ${relLabel(c.relationship)}` : 'wants to connect with you'}
              chipCaption="Hubs they want to open:"
              actions={
                <>
                  <Button size="sm" variant="accent" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: c.id, accept: true })}>Accept</Button>
                  <Button size="sm" variant="line" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: c.id, accept: false })}>Decline</Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="eyebrow">Sent · {outgoing.length}</div>
          {outgoing.map((c) => (
            <Row key={c.id} c={c} chipCaption="Hubs you asked to open:" actions={<span className="muted" style={{ fontSize: 12.5 }}>Pending…</span>} />
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="eyebrow">Connected · {accepted.length}</div>
          {accepted.length > 0 && (() => {
            const allExpanded = accepted.every((c) => expanded.has(c.id));
            return (
              <button type="button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(accepted.map((c) => c.id)))}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)' }}>
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            );
          })()}
        </div>
        {accepted.length === 0 ? (
          <EmptyState icon="🤝" title="No connections yet" hint="Send a request by handle above." />
        ) : (
          accepted.map((c) => (
            <Row key={c.id} c={c} subtitle={relLabel(c.relationship) ?? undefined}
              collapsible expanded={expanded.has(c.id)} onToggle={() => toggleOne(c.id)} actions={
              <>
                <Button size="sm" variant="line" onClick={() => { setRemoving(null); setManaging(managing === c.id ? null : c.id); }}>
                  {managing === c.id ? 'Close' : 'Manage'}
                </Button>
                <Button size="sm" variant="line" onClick={() => { setManaging(null); setRemoving(removing === c.id ? null : c.id); }}>
                  Remove
                </Button>
                <Button size="sm" variant="accent" disabled={opening === c.user.handle}
                  onClick={() => void openChat(c.user.handle)}>
                  {opening === c.user.handle ? '…' : 'Message'}
                </Button>
              </>
            }>
              {managing === c.id && <ManagePanel c={c} onDone={() => setManaging(null)} />}
              {removing === c.id && <RemoveConfirm c={c} onCancel={() => setRemoving(null)} />}
            </Row>
          ))
        )}
      </div>
    </div>
  );
}
