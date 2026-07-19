import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spinner } from '@/components/ui';
import { usersApi, chatApi, useConnections, type LookupResult } from '@/api';
import { useRequestConnection, useRespondConnection } from '@/api/connections.api';

/**
 * Private discovery: find ONE member by their EXACT @handle — there is no
 * directory, so you can only reach someone whose handle you already know.
 * Then connect, accept their pending request, or (once connected) message them.
 */
export function MemberFinder() {
  const navigate = useNavigate();
  const connections = useConnections();
  const requestConn = useRequestConnection();
  const respondConn = useRespondConnection();

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<LookupResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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
      await requestConn.mutateAsync(result.handle);
      setResult({ ...result, relationship: 'pending_out' });
    } catch { setError('Could not send the request — try again.'); }
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

      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBottom: result || error || (searched && !busy) ? 14 : 0 }}>
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

      {error && <p style={{ color: '#c0392b', fontSize: 12.5 }}>{error}</p>}

      {busy && <Spinner />}

      {!busy && searched && !result && !error && (
        <p className="muted" style={{ fontSize: 13 }}>No member found with that exact handle.</p>
      )}

      {!busy && result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid var(--line)' }}>
          <div className="tc-avatar" style={{ width: 40, height: 40, fontSize: 14, flexShrink: 0 }}>
            {result.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{result.name}</div>
            <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>@{result.handle}</div>
          </div>
          {result.relationship === 'none' && (
            <Button variant="accent" size="sm" disabled={requestConn.isPending} onClick={connect}>Connect</Button>
          )}
          {result.relationship === 'pending_out' && (
            <Button variant="line" size="sm" disabled>Requested</Button>
          )}
          {result.relationship === 'pending_in' && (
            <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={accept}>Accept request</Button>
          )}
          {result.relationship === 'accepted' && (
            <Button variant="accent" size="sm" disabled={opening} onClick={message}>{opening ? '…' : 'Message'}</Button>
          )}
          {result.relationship === 'blocked' && (
            <Button variant="line" size="sm" disabled>Unavailable</Button>
          )}
        </div>
      )}
    </Card>
  );
}
