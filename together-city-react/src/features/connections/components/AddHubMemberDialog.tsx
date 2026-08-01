import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { usersApi, useConnections, type LookupResult } from '@/api';
import { useHubs, useRequestConnection, useRespondConnection } from '@/api/connections.api';
import { RELATIONSHIPS, moduleDef } from '../modules';
import { PendingRequestNotice } from './PendingRequestNotice';

/**
 * One button, every hub. Instead of each hub running its own invite flow, a hub's
 * "+ Add Member" opens THIS dialog — a thin wrapper over the single People
 * connection request, pre-filtered for that hub's module. The person receives ONE
 * request in People; accepting connects the hub automatically (two-way sync keeps
 * the People permissions and the hub membership in lock-step).
 *
 * `moduleKey` — the hub this dialog connects (e.g. 'nutrition').
 *
 * Whether that hub is family-only is NOT a prop any more. It was, and each call
 * site passed its own answer — a second copy of a rule the server already owns
 * and now enforces (`connections/hub-grants.ts`). It is read from the registry.
 */
export function AddHubMemberDialog({
  moduleKey, title, blurb, onClose,
}: {
  moduleKey: string;
  title: string;
  blurb?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const connections = useConnections();
  const requestConn = useRequestConnection();
  const respondConn = useRespondConnection();

  const { data: hubs } = useHubs();
  const def = moduleDef(hubs, moduleKey);
  // Until the registry answers we do not claim a hub is family-only or that it
  // isn't. Locking the relationship on a guess is how the wrong request gets
  // sent; the server refuses it either way and says why.
  const familyOnly = hubs?.find((h) => h.slug === moduleKey)?.familyOnly ?? false;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<LookupResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<'family' | 'friend'>('friend');
  const [done, setDone] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const h = query.trim().replace(/^@/, '');
    if (!h) return;
    setBusy(true); setError(null); setSearched(true); setResult(null); setDone(false);
    try { setResult(await usersApi.lookup(h)); }
    catch { setError('Could not search right now — try again.'); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!result) return;
    // Always include this hub's module, plus Chat + Mail (added server-side).
    const rel = familyOnly ? 'family' : relationship;
    const modules = [moduleKey]; // Chat + Mail are added server-side (Universal).
    try {
      await requestConn.mutateAsync({ handle: result.handle, relationship: rel, modules });
      setDone(true);
      setResult({ ...result, relationship: 'pending_out' });
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not send the request — try again.');
    }
  };

  const accept = async () => {
    if (!result) return;
    const row = (connections.data ?? []).find((c) => c.user.id === result.id && c.status === 'pending');
    if (!row) { navigate('/connections'); return; }
    try {
      await respondConn.mutateAsync({ id: row.id, accept: true });
      setResult({ ...result, relationship: 'accepted' });
      setDone(true);
    } catch { setError('Could not accept — try again.'); }
  };

  const inp: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' };
  const canConnect = !!result && result.relationship === 'none';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,.5)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 460, width: '100%', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{def.emoji} {title}</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              {blurb ?? `Connect someone to your ${def.label} hub.`} They get ONE request in People — accepting connects {def.label} automatically. {familyOnly ? `${def.label} is a Family-only hub.` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={(e) => void search(e)} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
            <span className="muted">@</span>
            <input value={query} autoCapitalize="off" autoCorrect="off" spellCheck={false}
              onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="their exact handle" style={inp} />
          </div>
          <Button type="submit" variant="accent" size="sm" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</Button>
        </form>

        {error && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 12 }}>{error}</p>}
        {busy && <div style={{ marginTop: 12 }}><Spinner /></div>}
        {!busy && searched && !result && !error && (
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>No member found with that exact handle.</p>
        )}

        {!busy && result && (
          <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="tc-avatar" style={{ width: 44, height: 44, fontSize: 15, flexShrink: 0 }}>{result.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{result.name}</div>
                <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>@{result.handle}</div>
              </div>
              {result.relationship === 'pending_out' && <Button variant="line" size="sm" disabled>Requested</Button>}
              {result.relationship === 'pending_in' && <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={() => void accept()}>Accept request</Button>}
              {result.relationship === 'accepted' && <span style={{ fontSize: 12.5, color: '#2e7d4f', fontWeight: 700 }}>✓ Connected</span>}
              {result.relationship === 'blocked' && <Button variant="line" size="sm" disabled>Unavailable</Button>}
            </div>

            <PendingRequestNotice result={result} />

            {canConnect && (
              <div style={{ marginTop: 14 }}>
                {!familyOnly && (
                  <>
                    <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 8px' }}>Relationship</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {RELATIONSHIPS.map((r) => (
                        <button key={r.key} type="button" onClick={() => setRelationship(r.key)}
                          style={{ cursor: 'pointer', flex: 1, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 0', borderRadius: 10,
                            border: `1.5px solid ${relationship === r.key ? 'var(--accent)' : 'var(--line)'}`,
                            background: relationship === r.key ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--ink)' }}>
                          {r.emoji} {r.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--accent-soft)', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{def.emoji} {def.label}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>will be connected · Chat & Mail are always on</span>
                </div>
                <Button variant="accent" onClick={() => void connect()} disabled={requestConn.isPending} style={{ width: '100%' }}>
                  {requestConn.isPending ? 'Sending…' : `Send request →`}
                </Button>
              </div>
            )}

            {done && result.relationship === 'pending_out' && (
              <p style={{ fontSize: 12.5, marginTop: 12, color: 'var(--accent)', fontWeight: 600 }}>✓ Request sent. They’ll accept it in People, and {def.label} connects automatically.</p>
            )}
          </div>
        )}

        <p className="muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.5 }}>
          Manage everyone in one place under <button type="button" onClick={() => navigate('/connections')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}>People</button>. This dialog only adds someone; removing them is done there, and it disconnects them from every hub at once.
        </p>
      </div>
    </div>
  );
}
