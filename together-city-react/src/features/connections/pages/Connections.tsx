import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useConnections, useRespondConnection, chatApi } from '@/api';
import type { Connection } from '@/api/schemas';
import { MemberFinder } from '../components/MemberFinder';
import { useUpdateModules } from '@/api/connections.api';
import { DEFAULT_MODULES, RELATIONSHIPS, allowedModules } from '../modules';
import { ModuleChips, ModuleToggles } from '../components/ModuleToggles';

function Avatar({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
        background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 15,
      }}
    >
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

function Row({ c, actions, subtitle, children }: { c: Connection; actions?: React.ReactNode; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={c.user.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{c.user.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>@{c.user.handle}{subtitle ? ` · ${subtitle}` : ''}</div>
          <ModuleChips modules={c.modules ?? DEFAULT_MODULES} />
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

const relLabel = (r?: string | null) => RELATIONSHIPS.find((x) => x.key === r)?.label ?? null;

/** Manage a connection's module grants — the ONE record every hub queries. */
function ManagePanel({ c }: { c: Connection }) {
  const update = useUpdateModules();
  const [selected, setSelected] = useState<string[]>(c.modules ?? DEFAULT_MODULES);
  const rel = c.relationship ?? 'friend';
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...(c.modules ?? DEFAULT_MODULES)].sort());
  return (
    <div style={{ marginTop: 10, paddingLeft: 56 }}>
      <ModuleToggles relationship={rel} selected={selected.filter((k) => allowedModules(rel).includes(k))} onChange={setSelected} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <Button size="sm" variant="accent" disabled={!dirty || update.isPending}
          onClick={() => update.mutate({ id: c.id, modules: selected })}>
          {update.isPending ? 'Saving…' : 'Save modules'}
        </Button>
        <span className="muted" style={{ fontSize: 11 }}>Connected hubs update everywhere immediately.</span>
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

  const openChat = async (h: string) => {
    setOpening(h);
    try {
      const conv = await chatApi.startDirect(h);
      await qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      navigate(`/chats?c=${conv.id}`);
    } finally { setOpening(null); }
  };

  if (all.isLoading) return <Spinner label="Loading your connections…" />;
  if (all.isError) return <EmptyState title="Couldn't load connections" hint="Start the backend and reload." />;

  const incoming = (all.data ?? []).filter((c) => c.status === 'pending' && c.incoming);
  const outgoing = (all.data ?? []).filter((c) => c.status === 'pending' && !c.incoming);
  const accepted = (all.data ?? []).filter((c) => c.status === 'accepted');

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
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
          {incoming.map((c) => (
            <Row
              key={c.id}
              c={c}
              subtitle={relLabel(c.relationship) ? `wants to connect with you as ${relLabel(c.relationship)}` : 'wants to connect with you'}
              actions={
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="accent" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: c.id, accept: true })}>Accept</Button>
                  <Button size="sm" variant="line" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: c.id, accept: false })}>Decline</Button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="eyebrow">Sent · {outgoing.length}</div>
          {outgoing.map((c) => (
            <Row key={c.id} c={c} actions={<span className="muted" style={{ fontSize: 12.5 }}>Pending…</span>} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="eyebrow">Connected · {accepted.length}</div>
        {accepted.length === 0 ? (
          <EmptyState icon="🤝" title="No connections yet" hint="Send a request by handle above." />
        ) : (
          accepted.map((c) => (
            <Row key={c.id} c={c} subtitle={relLabel(c.relationship) ?? undefined} actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="line" onClick={() => setManaging(managing === c.id ? null : c.id)}>
                  {managing === c.id ? 'Close' : 'Modules'}
                </Button>
                <Button size="sm" variant="accent" disabled={opening === c.user.handle}
                  onClick={() => openChat(c.user.handle)}>
                  {opening === c.user.handle ? '…' : 'Message'}
                </Button>
              </div>
            }>
              {managing === c.id && <ManagePanel c={c} />}
            </Row>
          ))
        )}
      </div>
    </div>
  );
}
