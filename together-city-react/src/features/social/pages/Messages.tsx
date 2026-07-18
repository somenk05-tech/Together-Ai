import { useState, type FormEvent } from 'react';
import { Avatar, initials } from '../shared';

interface Bubble { me: boolean; text: string; time: string }
interface Convo {
  handle: string; name: string; color: string; preview: string; time: string; unread: number; thread: Bubble[];
}

const SEED: Convo[] = [
  {
    handle: '@aaravm', name: 'Aarav Mehta', color: '#b0503e', preview: 'Golden hour shots turned out amazing 🌇', time: '2m', unread: 2,
    thread: [
      { me: false, text: 'Did you get the Marine Drive photos?', time: '9:40 AM' },
      { me: true, text: 'Yes! The light was unreal.', time: '9:41 AM' },
      { me: false, text: 'Golden hour shots turned out amazing 🌇', time: '9:42 AM' },
    ],
  },
  {
    handle: '@sanak', name: 'Sana Kapoor', color: '#3a6ea5', preview: 'That café near Kala Ghoda — still open?', time: '18m', unread: 0,
    thread: [
      { me: false, text: 'That café near Kala Ghoda — still open?', time: '9:22 AM' },
      { me: true, text: 'Till 11 I think. Best croissants in town.', time: '9:25 AM' },
    ],
  },
  {
    handle: '@kabirn', name: 'Kabir Nair', color: '#2e5c3f', preview: 'Sinhagad trek this weekend?', time: '1h', unread: 1,
    thread: [
      { me: false, text: 'Sinhagad trek this weekend?', time: '8:10 AM' },
    ],
  },
  {
    handle: '@rhea', name: 'Rhea Sharma', color: '#7a4fa0', preview: 'Sent you the circle invite ✨', time: '3h', unread: 0,
    thread: [
      { me: false, text: 'Sent you the circle invite ✨', time: '6:30 AM' },
      { me: true, text: 'Joined! Thanks Rhea 🙌', time: '6:45 AM' },
    ],
  },
  {
    handle: '@meera', name: 'Meera Iyer', color: '#b08d3e', preview: 'Cubbon Park run tomorrow morning?', time: '1d', unread: 0,
    thread: [
      { me: false, text: 'Cubbon Park run tomorrow morning?', time: 'Yesterday' },
    ],
  },
];

/** Social Life · Messages — direct conversations with your Together City members. */
export function Messages() {
  const [convos, setConvos] = useState<Convo[]>(SEED);
  const [activeIdx, setActiveIdx] = useState(0);
  const [text, setText] = useState('');
  const active = convos[activeIdx];

  const openConvo = (i: number) => {
    setActiveIdx(i);
    setConvos((prev) => prev.map((c, j) => (j === i ? { ...c, unread: 0 } : c)));
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setConvos((prev) => prev.map((c, j) =>
      j === activeIdx
        ? { ...c, preview: t, time: 'now', thread: [...c.thread, { me: true, text: t, time: 'now' }] }
        : c,
    ));
    setText('');
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <div className="eyebrow">Social Life · Messages</div>
        <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>Your conversations</h1>
      </div>

      <div className="rise d1" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {convos.map((c, i) => (
            <div
              key={c.handle} onClick={() => openConvo(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: i === activeIdx ? 'var(--accent-soft)' : 'transparent' }}
            >
              <Avatar label={initials(c.name)} color={c.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 13.5 }}>{c.name}</b>
                  <span className="muted" style={{ fontSize: 11 }}>{c.time}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview}</div>
              </div>
              {c.unread > 0 && (
                <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'grid', placeItems: 'center', padding: '0 5px' }}>{c.unread}</span>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <Avatar label={initials(active.name)} color={active.color} />
            <div>
              <b style={{ fontSize: 14 }}>{active.name}</b>
              <div className="muted" style={{ fontSize: 11.5 }}>{active.handle} · connected</div>
            </div>
          </div>

          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {active.thread.map((b, i) => (
              <div key={i} style={{ alignSelf: b.me ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                <div
                  style={{ padding: '9px 13px', borderRadius: 16, fontSize: 13.5, lineHeight: 1.45, background: b.me ? 'var(--accent)' : 'var(--paper)', color: b.me ? '#fff' : 'var(--ink)', border: b.me ? 'none' : '1px solid var(--line)' }}
                >
                  {b.text}
                </div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 3, textAlign: b.me ? 'right' : 'left' }}>{b.time}</div>
              </div>
            ))}
          </div>

          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
            <input
              value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${active.name.split(' ')[0]}…`}
              style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
            />
            <button type="submit" className="btn btn-accent btn-sm" disabled={!text.trim()}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
