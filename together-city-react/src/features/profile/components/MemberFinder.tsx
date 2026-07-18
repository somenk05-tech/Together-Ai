import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spinner } from '@/components/ui';
import { useChatContacts, chatApi, type Contact } from '@/api';
import { useRequestConnection } from '@/api/connections.api';

/**
 * Search other Together City citizens, then connect with them (send a connection
 * request) or message them immediately (opens a chat with the composer ready).
 */
export function MemberFinder() {
  const contacts = useChatContacts();
  const requestConn = useRequestConnection();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const [opening, setOpening] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = contacts.data ?? [];
    if (!q) return all.slice(0, 8);
    return all
      .filter((c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q))
      .slice(0, 12);
  }, [contacts.data, query]);

  const connect = (c: Contact) => {
    setRequested((s) => ({ ...s, [c.handle]: true })); // optimistic
    requestConn.mutate(c.handle);
  };

  const message = async (c: Contact) => {
    setOpening(c.handle);
    try {
      const conv = await chatApi.startDirect(c.handle);
      navigate(`/chats?c=${conv.id}`);
    } finally {
      setOpening(null);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12,
    fontSize: 14, marginBottom: 12, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <Card style={{ marginBottom: 24 }}>
      <h4 style={{ margin: '0 0 4px' }}>Find citizens</h4>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Search Together City members to connect or message them.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or @handle" style={inp} />
      {contacts.isLoading ? (
        <Spinner />
      ) : results.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {query ? 'No citizens match that search.' : 'No other citizens yet — invite people to join Together City.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {results.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px', borderTop: '1px solid var(--line)' }}>
              <div className="tc-avatar" style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }}>
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>@{c.handle}</div>
              </div>
              <Button variant="line" size="sm" disabled={requested[c.handle]} onClick={() => connect(c)}>
                {requested[c.handle] ? 'Requested' : 'Connect'}
              </Button>
              <Button variant="accent" size="sm" disabled={opening === c.handle} onClick={() => message(c)}>
                {opening === c.handle ? '…' : 'Message'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
