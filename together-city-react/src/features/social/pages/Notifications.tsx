import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Note {
  to: string; icon: string; bg: string; fg: string; t: React.ReactNode; m: string;
}

const TODAY: Note[] = [
  { to: '/social/feed', icon: '♥', bg: 'var(--rose-soft)', fg: 'var(--rose)', t: <><b>Neha Sharma</b> and 213 others liked your post</>, m: '"Golden hour in the city that never sleeps" · 12 min ago' },
  { to: '/social/feed', icon: '💬', bg: 'var(--blue-soft)', fg: 'var(--blue)', t: <><b>Rohan Mehta</b> commented: "That view though 😍"</>, m: 'On your Marine Drive post · 40 min ago' },
  { to: '/social/circle', icon: '◈', bg: 'var(--accent-soft)', fg: 'var(--accent)', t: <><b>Foodies of Together City</b> — 3 new posts in your circle</>, m: 'Priya, Rahul and 1 other posted · 1 hour ago' },
  { to: '/social/messages', icon: '✓', bg: 'var(--green-soft)', fg: 'var(--green)', t: <><b>Arjun Kapoor</b> accepted your friend request</>, m: "You're now connected · 2 hours ago" },
];

const YESTERDAY: Note[] = [
  { to: '/social/feed', icon: '@', bg: 'var(--gold-soft)', fg: 'var(--gold)', t: <><b>Karan Malhotra</b> mentioned you in a comment</>, m: '"Ask @somen — he knows this place well" · 9:40 PM' },
  { to: '/social/circle', icon: '◆', bg: 'var(--accent-soft)', fg: 'var(--accent)', t: <>You were added to <b>Travel Buddies</b></>, m: 'by Sneha Iyer · 6:10 PM' },
  { to: '/social/feed', icon: '✦', bg: 'var(--purple-soft)', fg: 'var(--purple)', t: <>Your review of Bombay Brasserie got a reply</>, m: 'Restaurants · from the venue owner · 3:22 PM' },
];

const WEEK: Note[] = [
  { to: '/social/feelings', icon: '👥', bg: 'var(--green-soft)', fg: 'var(--green)', t: <>4 friends nearby right now</>, m: 'Neha, Rohan +2 within 2 km · Monday' },
  { to: '/social/create', icon: '★', bg: 'var(--accent-soft)', fg: 'var(--accent)', t: <>You earned the <b>Foodie Reviewer</b> badge</>, m: '47 authentic reviews published · Monday' },
];

function Section({ title, notes, delay }: { title: string; notes: Note[]; delay: string }) {
  return (
    <section className={`blk rise ${delay}`}>
      <div className="blk-head"><h2>{title}</h2></div>
      <div className="rows">
        {notes.map((n, i) => (
          <Link key={i} className="row" to={n.to}>
            <div className="av" style={{ background: n.bg, color: n.fg }}>{n.icon}</div>
            <div className="grow"><div className="t">{n.t}</div><div className="m">{n.m}</div></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const FILTERS = ['All', 'Unread', 'Mentions'];

/** Social Life · Notifications — likes, comments, mentions & follows. */
export function SocialNotifications() {
  const [filter, setFilter] = useState(0);
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div
        className="rise"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}
      >
        <div>
          <div className="eyebrow">Social Life · Notifications</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Likes, comments &amp; mentions</h1>
        </div>
        <div className="pill-row">
          {FILTERS.map((f, i) => (
            <span key={f} className={i === filter ? 'pill on' : 'pill'} style={{ cursor: 'pointer' }} onClick={() => setFilter(i)}>{f}</span>
          ))}
          <span className="btn btn-line btn-sm" style={{ cursor: 'pointer' }}>Mark all read</span>
        </div>
      </div>

      <Section title="Today" notes={TODAY} delay="d1" />
      <Section title="Yesterday" notes={YESTERDAY} delay="d2" />
      <Section title="This Week" notes={WEEK} delay="d3" />
    </div>
  );
}
