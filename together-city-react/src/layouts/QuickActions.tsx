import { Link } from 'react-router-dom';
import { useIncomingRequestCount, useUnreadChatCount } from '@/api';
import { Icon } from '@/components/ui/Icon';

/** Small red count bubble (shared with the header). */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-label={`${count} pending`} style={{
      position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
      borderRadius: 999, background: '#e0342b', color: '#fff', fontSize: 10, fontWeight: 700,
      display: 'grid', placeItems: 'center', lineHeight: 1,
    }}>{count > 9 ? '9+' : count}</span>
  );
}

const pill: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, letterSpacing: '.06em', fontWeight: 600,
  padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 999, color: 'var(--ink)',
  whiteSpace: 'nowrap', textTransform: 'uppercase', background: 'transparent', position: 'relative',
};

/**
 * Search · People · Mail · Chat quick-action pills. Lives in the header on inner
 * pages, and (on the city home) in a bar just below the hero video — same
 * aesthetics in both places.
 */
export function QuickActions() {
  const requests = useIncomingRequestCount();
  const unreadChats = useUnreadChatCount();
  return (
    <div className="tc-actions" style={{ gap: 8 }}>
      <button type="button" aria-label="Search — jump to anything (Ctrl/Cmd K)" title="Search (⌘K)"
        onClick={() => window.dispatchEvent(new Event('tc:command'))}
        style={{ ...pill, cursor: 'pointer', font: 'inherit', fontSize: 10.5, letterSpacing: '.06em', fontWeight: 600, textTransform: 'uppercase' }}>
        <Icon name="search" size={17} /> <span className="lab">SEARCH</span>
      </button>
      <Link to="/connections" aria-label="Requests" style={pill}>
        <Icon name="connection" size={17} /> <span className="lab">PEOPLE</span>
        <Badge count={requests} />
      </Link>
      <Link to="/mail/inbox" aria-label="Mail" style={pill}>
        <Icon name="mail" size={17} /> <span className="lab">MAIL</span>
      </Link>
      <Link to="/chats" aria-label="Chat" style={pill}>
        <Icon name="chat" size={17} /> <span className="lab">CHAT</span>
        <Badge count={unreadChats} />
      </Link>
    </div>
  );
}
