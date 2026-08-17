import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Card, Button, Spinner } from '@/components/ui';
import { usersApi, chatApi, useConnections, type LookupResult } from '@/api';
import { useHubs, useRequestConnection, useRespondConnection } from '@/api/connections.api';
import { DEFAULT_MODULES, RELATIONSHIPS, allowedModules } from '../modules';
import { ModuleToggles } from './ModuleToggles';
import { PendingRequestNotice } from './PendingRequestNotice';

/**
 * Private discovery: find ONE member by their EXACT @handle — there is no
 * directory, so you can only reach someone whose handle you already know.
 * Then connect, accept their pending request, or (once connected) message them.
 */
export function MemberFinder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connections = useConnections();
  const requestConn = useRequestConnection();
  const respondConn = useRespondConnection();
  // Which hubs exist, and which this relationship may hold, is the server's answer.
  const { data: hubs } = useHubs();

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<LookupResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [relationship, setRelationship] = useState<'family' | 'friend'>('friend');
  const [modules, setModules] = useState<string[]>(DEFAULT_MODULES);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const h = query.trim().replace(/^@/, '');
    if (!h) return;
    setBusy(true); setError(null); setSearched(true); setResult(null);
    try {
      setResult(await usersApi.lookup(h));
    } catch {
      setError('Could not search right now — try again.');
    } finally { setBusy(false); }
  };

  const connect = async () => {
    if (!result) return;
    try {
      const scoped = modules.filter((m) => allowedModules(hubs, relationship).includes(m));
      await requestConn.mutateAsync({ handle: result.handle, relationship, modules: scoped.length ? scoped : DEFAULT_MODULES });
      setConnecting(false);
      setResult({ ...result, relationship: 'pending_out' });
    } catch (e) {
      // Surface what the server said. It refuses a family-only hub on a
      // connection that isn't family, and the reason is the useful part.
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not send the request — try again.');
    }
  };

  const accept = async () => {
    if (!result) return;
    // Find the pending connection row for this member to accept it.
    const row = (connections.data ?? []).find((c) => c.user.id === result.id && c.status === 'pending');
    if (!row) { navigate('/connections'); return; }
    try {
      await respondConn.mutateAsync({ id: row.id, accept: true });
      setResult({ ...result, relationship: 'accepted' });
    } catch { setError('Could not accept — try again.'); }
  };

  const message = async () => {
    if (!result) return;
    setOpening(true);
    try {
      const conv = await chatApi.startDirect(result.handle);
      await qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      navigate(`/chats?c=${conv.id}`);
    } catch {
      setError('You can message them once you’re connected.');
    } finally { setOpening(false); }
  };

  const inp: React.CSSProperties = {
    flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14,
    fontFamily: 'inherit', background: 'transparent',
  };

  return (
    <Card style={{ marginBottom: 24 }}>
      <h4 style={{ margin: '0 0 4px' }}>Find a member</h4>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Enter someone’s exact @handle to connect. Profiles aren’t listed publicly — you need their handle.
      </p>

      <form onSubmit={(e) => void search(e)} style={{ display: 'flex', gap: 8, marginBottom: result || error || (searched && !busy) ? 14 : 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
          <span className="muted">@</span>
          <input value={query} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            placeholder="their exact handle" style={inp} />
        </div>
        <Button type="submit" variant="accent" size="sm" disabled={busy || !query.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5 }}>{error}</p>}

      {busy && <Spinner />}

      {!busy && searched && !result && !error && (
        <p className="muted" style={{ fontSize: 13 }}>No member found with that exact handle.</p>
      )}

      {!busy && result && (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid var(--line)' }}>
          <Avatar src={result.profileImage} name={result.name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{result.name}</div>
            <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>@{result.handle}</div>
          </div>
          {result.relationship === 'none' && !connecting && (
            <Button variant="accent" size="sm" onClick={() => setConnecting(true)}>Connect</Button>
          )}
          {result.relationship === 'pending_out' && (
            <Button variant="line" size="sm" disabled>Requested</Button>
          )}
          {result.relationship === 'pending_in' && (
            <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={() => void accept()}>Accept request</Button>
          )}
          {result.relationship === 'accepted' && (
            <Button variant="accent" size="sm" disabled={opening} onClick={() => void message()}>{opening ? '…' : 'Message'}</Button>
          )}
          {result.relationship === 'blocked' && (
            <Button variant="line" size="sm" disabled>Unavailable</Button>
          )}
        </div>
        <PendingRequestNotice result={result} />
        </>
      )}

      {/* Universal Connection Model: relationship first, then the hubs to connect */}
      {!busy && result && result.relationship === 'none' && connecting && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 8px' }}>Relationship</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {RELATIONSHIPS.map((r) => (
              <button key={r.key} type="button"
                onClick={() => { setRelationship(r.key); setModules((m) => m.filter((k) => allowedModules(hubs, r.key).includes(k))); }}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 16px',
                  borderRadius: 10, border: `1.5px solid ${relationship === r.key ? 'var(--accent)' : 'var(--line)'}`,
                  background: relationship === r.key ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--ink)' }}>
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 8px' }}>Connect modules</p>
          <ModuleToggles relationship={relationship} selected={modules} onChange={setModules} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Button variant="accent" size="sm" disabled={requestConn.isPending || modules.length === 0} onClick={() => void connect()}>
              {requestConn.isPending ? 'Sending…' : 'Send Connection Request'}
            </Button>
            <span className="muted" style={{ fontSize: 11.5 }}>
              They get ONE request in People — accepted hubs connect everywhere automatically.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
