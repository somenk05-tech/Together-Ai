import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { candByHandle, initials, maskCode } from '../datingStatic';

interface Msg { from: 'me' | 'them'; text: string }

const REPLIES = ['Sounds good!', 'Haha yes 😄', "Perfect, let's do it.", 'See you there!'];

const chatbar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)',
  border: '1px solid var(--line)', borderRadius: '18px 18px 0 0', padding: '14px 16px',
};
const privacy: CSSProperties = {
  background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0',
  padding: '10px 14px', fontSize: 12, color: 'var(--ink-soft)', margin: 0,
};
const msgsBox: CSSProperties = {
  background: 'var(--card)', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)',
  padding: 16, minHeight: 300, maxHeight: '52vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
};
const composer: CSSProperties = {
  display: 'flex', gap: 8, border: '1px solid var(--line)', borderTop: 'none',
  borderRadius: '0 0 18px 18px', padding: '12px 14px', background: 'var(--card)',
};
const composerInput: CSSProperties = { flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: 'var(--ink)', fontFamily: 'inherit' };
const sendBtn: CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const friendbar: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  marginTop: 14, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px',
};

function bubble(m: Msg, i: number) {
  const me = m.from === 'me';
  return (
    <div
      key={i}
      style={{
        maxWidth: '74%', padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.4,
        alignSelf: me ? 'flex-end' : 'flex-start',
        background: me ? 'var(--accent)' : 'var(--paper)',
        color: me ? '#fff' : 'var(--ink)',
        borderBottomRightRadius: me ? 5 : 14, borderBottomLeftRadius: me ? 14 : 5,
      }}
    >
      {m.text}
    </div>
  );
}

export function DatingChat() {
  const [params] = useSearchParams();
  const handle = params.get('u') || '@ananya';
  const cand = candByHandle(handle) ?? { name: 'Member', handle, color: '#888', age: 0, city: '', matchScore: 0 };

  const [messages, setMessages] = useState<Msg[]>([{ from: 'them', text: 'Hey! Looking forward to the plan 😊' }]);
  const [draft, setDraft] = useState('');
  const [friendMe, setFriendMe] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset per conversation when the handle changes.
  useEffect(() => {
    setMessages([{ from: 'them', text: 'Hey! Looking forward to the plan 😊' }]);
    setDraft(''); setFriendMe(false); setRevealed(false);
  }, [handle]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: 'me', text }]);
    setDraft('');
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    window.setTimeout(() => setMessages((prev) => [...prev, { from: 'them', text: reply }]), 900);
  }

  function askFriends() {
    setFriendMe(true);
    // Simulate the other person accepting (demo).
    window.setTimeout(() => { setFriendMe(false); setRevealed(true); }, 1400);
  }

  const shownName = revealed ? cand.name : maskCode(handle);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="eyebrow rise">Dating Hub · Match chat</div>

        <div style={chatbar}>
          {revealed ? (
            <div className="av" style={{ background: cand.color, color: '#fff' }}>{initials(cand.name)}</div>
          ) : (
            <div className="av" style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>🕶</div>
          )}
          <div style={{ flex: 1 }}>
            <b>{shownName}</b>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {revealed ? (cand.city || 'On Together City') : 'Identity hidden until you both connect'}
            </div>
          </div>
          {revealed && <Link to="/dating/matches"><Button variant="line" size="sm">View profile</Button></Link>}
        </div>

        <p style={privacy}>
          🔒 On Together City, chat IDs and real identities stay hidden until you both choose to become friends.
          Talk freely, plan the activity, reveal when you're ready.
        </p>

        <div style={msgsBox} ref={scrollRef}>
          {messages.map(bubble)}
        </div>

        <div style={composer}>
          <input
            style={composerInput} value={draft} placeholder="Message…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          />
          <button type="button" style={sendBtn} onClick={send}>Send</button>
        </div>

        <div style={friendbar}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {revealed ? "You can now see each other's profiles." : 'Enjoying the conversation?'}
          </span>
          {revealed ? (
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>✓ You're friends — identities revealed</span>
          ) : friendMe ? (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>You asked to connect — waiting for them…</span>
          ) : (
            <Button variant="gold" size="sm" onClick={askFriends}>Ask to become friends</Button>
          )}
        </div>
    </div>
  );
}
