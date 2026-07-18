import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, initials, timeAgo } from '../shared';

interface Reply { who: string; text: string; ts: number }
interface Feeling {
  id: string;
  author: { name: string; handle: string; color: string };
  text: string;
  ts: number;
  likes: string[];
  liked: boolean;
  replies: Reply[];
}

const H = 3600000, D = 86400000;
const ME = '@you';

const SEED: Feeling[] = [
  { id: 'f1', author: { name: 'Rhea Sharma', handle: '@rhea', color: '#7a4fa0' }, text: 'some days the city just hums in your favour ✨', ts: Date.now() - 40 * 60000, likes: ['@aaravm', '@meera'], liked: false, replies: [{ who: 'Meera', text: 'felt this', ts: Date.now() - 20 * 60000 }] },
  { id: 'f2', author: { name: 'Kabir Nair', handle: '@kabirn', color: '#2e5c3f' }, text: 'unpopular opinion: filter coffee > everything. fight me ☕', ts: Date.now() - 3 * H, likes: ['@sanak', '@rhea', '@devp'], liked: false, replies: [] },
  { id: 'f3', author: { name: 'Aarav Mehta', handle: '@aaravm', color: '#b0503e' }, text: '6am runs hit different when the whole city is still asleep.', ts: Date.now() - 8 * H, likes: ['@meera'], liked: false, replies: [] },
  { id: 'f4', author: { name: 'Sana Kapoor', handle: '@sanak', color: '#3a6ea5' }, text: 'note to self: rest is productive too.', ts: Date.now() - 1 * D, likes: ['@rhea', '@kabirn', '@aaravm', '@meera'], liked: false, replies: [{ who: 'Aarav', text: 'needed to read this today 🙏', ts: Date.now() - 20 * H }] },
];

/** #hashtags and @mentions rendered in the accent colour. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/([#@]\w+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[#@]\w+$/.test(p)
          ? <span key={i} style={{ color: 'var(--accent)' }}>{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function FeelingCard({
  f, onLike, onReply,
}: { f: Feeling; onLike: (id: string) => void; onReply: (id: string, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onReply(f.id, text.trim());
    setText('');
  };

  return (
    <div
      className="ftweet"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 12, display: 'flex', gap: 12 }}
    >
      <Avatar label={initials(f.author.name)} color={f.author.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>{f.author.name}</b>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{f.author.handle}</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>· {timeAgo(f.ts)}</span>
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, margin: '4px 0 8px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          <RichText text={f.text} />
        </div>
        <div style={{ display: 'flex', gap: 26, fontSize: 13, color: 'var(--muted)' }}>
          <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setOpen((o) => !o)}>
            💬 {f.replies.length}
          </span>
          <span
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: f.liked ? '#e0245e' : undefined }}
            onClick={() => onLike(f.id)}
          >
            {f.liked ? '♥' : '♡'} {f.likes.length}
          </span>
          <span style={{ cursor: 'pointer' }}>↗</span>
        </div>

        {f.replies.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            {f.replies.map((r, i) => (
              <div key={i} style={{ fontSize: 13, margin: '4px 0' }}>
                <b>{r.who}</b> <span className="muted" style={{ fontSize: 11 }}>{timeAgo(r.ts)}</span>
                <br />{r.text}
              </div>
            ))}
          </div>
        )}

        {open && (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Post your reply…"
              autoFocus
              style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 999, padding: '7px 12px', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }}
            />
            <button type="submit" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>Reply</button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Social Life · Feelings — a quieter, Twitter-style microblog ("Say anything").
 * Client-side only, mirroring the static site (no dedicated backend endpoint).
 */
export function Feelings() {
  const { user } = useAuth();
  const me = useMemo(() => ({ name: user?.name ?? 'You', color: '#b0503e' }), [user]);
  const [feelings, setFeelings] = useState<Feeling[]>(SEED);
  const [text, setText] = useState('');
  const left = 280 - text.length;

  const post = () => {
    const t = text.trim();
    if (!t) return;
    const f: Feeling = {
      id: `f${Date.now()}`,
      author: { name: me.name, handle: ME, color: me.color },
      text: t.slice(0, 280),
      ts: Date.now(),
      likes: [],
      liked: false,
      replies: [],
    };
    setFeelings((prev) => [f, ...prev]);
    setText('');
  };

  const like = (id: string) =>
    setFeelings((prev) => prev.map((f) =>
      f.id === id
        ? { ...f, liked: !f.liked, likes: f.liked ? f.likes.filter((h) => h !== ME) : [...f.likes, ME] }
        : f,
    ));

  const reply = (id: string, t: string) =>
    setFeelings((prev) => prev.map((f) =>
      f.id === id
        ? { ...f, replies: [...f.replies, { who: me.name.split(' ')[0], text: t, ts: Date.now() }] }
        : f,
    ));

  const sorted = [...feelings].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Social Life · Feelings</div>
        <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>Say anything</h1>
        <p className="lede">A quieter place to write what you're thinking — no likes-chasing, just words.</p>
      </div>

      <div
        className="compose rise d1"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}
      >
        <Avatar label={initials(me.name)} color={me.color} />
        <div style={{ flex: 1 }}>
          <textarea
            value={text}
            maxLength={280}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(); }}
            placeholder="What are you feeling?"
            style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'none', fontSize: 16, fontFamily: 'inherit', color: 'var(--ink)', minHeight: 52 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <span style={{ fontSize: 12, color: left < 0 ? '#e0245e' : 'var(--muted)' }}>{left}</span>
            <Button type="button" variant="accent" size="sm" onClick={post} disabled={!text.trim()}>Post</Button>
          </div>
        </div>
      </div>

      <div className="rise d2">
        {sorted.map((f) => (
          <FeelingCard key={f.id} f={f} onLike={like} onReply={reply} />
        ))}
      </div>
    </div>
  );
}

/** Social Life · Explore — alias of Feelings ("Say anything"), matching the static site's Explore card. */
export function Explore() {
  return <Feelings />;
}
