import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useFollowers, useFollowing } from '../api';
import { initials } from '../shared';

interface MyPost {
  id: string; caption: string; dur: number; hue: number; emoji: string;
  outdoor: boolean; views: number; likes: number; comments: number;
}

const MY_POSTS: MyPost[] = [
  { id: 'me1', caption: 'my day in the city + how Together City plans it all', dur: 214, hue: 210, emoji: '🌆', outdoor: false, views: 2140, likes: 1, comments: 0 },
  { id: 'me2', caption: 'cooking my go-to meal from the Together City recipe planner', dur: 187, hue: 20, emoji: '🍜', outdoor: true, views: 1580, likes: 2, comments: 0 },
];

const PAY_PER_VIDEO = 100;
const DAILY_CAP = 15;
const DAILY_CAP_INR = PAY_PER_VIDEO * DAILY_CAP;

const TOPICS = [
  'Your life & personal journey', 'Your daily routine', 'Food reviews & cooking', 'Restaurants & cafés',
  'Health & fitness', 'Beauty & skincare', 'Hair & self-care', 'Fashion & shopping',
  'Relationships & dating', 'Travel experiences', 'Movies & entertainment', 'Career & work life',
  'Personal growth', 'Dreams & goals', 'Family & friendships', 'Hobbies & passions',
];

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const dur = (s: number) => `${Math.floor(s / 60)}:${(s % 60) < 10 ? '0' : ''}${s % 60}`;

function MediaTile({ p }: { p: MyPost }) {
  return (
    <div style={{ aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', position: 'relative', background: 'var(--paper)' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, background: `linear-gradient(140deg,hsl(${p.hue},40%,40%),hsl(${(p.hue + 40) % 360},44%,24%))` }}>
        {p.emoji}
        <span style={{ position: 'absolute', width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: 18, paddingLeft: 3 }}>▶</span>
      </div>
      {p.outdoor && <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 14 }}>📍</span>}
    </div>
  );
}

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ marginTop: 16, ...style }}>
      <div className="blk-head"><h3>{title}</h3></div>
      {children}
    </div>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: 'var(--muted)' }}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function EarnView() {
  const earned = MY_POSTS.reduce((a, p) => a + (p.dur >= 180 ? PAY_PER_VIDEO : 0), 0);
  const eligible = MY_POSTS.filter((p) => p.dur >= 180).length;
  const views = MY_POSTS.reduce((a, p) => a + p.views, 0);
  const redeemed = 0;
  const balance = Math.max(0, earned - redeemed);

  const rows = [...MY_POSTS].reverse();

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,var(--accent),#7a4fa0)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: '22px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '.05em' }}>Redeemable balance</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 38, lineHeight: 1 }}>{money(balance)}</div>
        <div style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>Redeem at checkout across selected services</div>
        <Link className="btn btn-sm" to="/social/feed" style={{ marginTop: 14, display: 'inline-block', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.4)', color: '#fff' }}>Redeem at checkout →</Link>
      </div>

      <div className="card">
        <div className="blk-head"><h3>Turn your stories into earnings</h3></div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Share authentic videos about your life, experiences and interests while helping others discover Together City.
          Earn up to <b>{money(PAY_PER_VIDEO)} per eligible video</b>, up to <b>{money(DAILY_CAP_INR)} per day</b> for {DAILY_CAP} approved videos.
        </p>
        <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
          {[[money(earned), 'total earned'], [String(eligible), 'approved videos'], [money(redeemed), 'redeemed'], [views.toLocaleString(), 'total views']].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{n}</div>
              <div className="muted" style={{ fontSize: 11 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Card title="What can you make videos about?">
        <div style={{ marginTop: 10 }}>
          {TOPICS.map((t) => (
            <span key={t} style={{ display: 'inline-block', background: 'var(--surface-2,#f2eee9)', border: '1px solid var(--line,#e5ddd3)', borderRadius: 999, padding: '5px 11px', fontSize: 12, margin: '0 6px 6px 0' }}>{t}</span>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Where relevant, show how Together City makes life easier, healthier, safer, more affordable, more connected or more enjoyable.
        </p>
      </Card>

      <Card title="How to earn">
        <List items={[
          'Choose a topic you genuinely enjoy.',
          'Record an original video.',
          'Upload it to Together City.',
          <>Once reviewed &amp; approved, earn up to {money(PAY_PER_VIDEO)} for that video.</>,
          <>Publish up to {DAILY_CAP} approved videos a day to earn up to {money(DAILY_CAP_INR)} daily.</>,
        ]}
        />
      </Card>

      <Card title="Eligibility requirements">
        <List items={[
          <>Minimum <b>3 minutes</b> in duration.</>,
          'Original content created by you.',
          'Genuine value — information, entertainment or inspiration.',
          'Clear audio and video quality.',
          'Follows the Community Guidelines.',
          'Passes our content review.',
        ]}
        />
      </Card>

      <Card title="Community guidelines" style={{ border: '1px solid #e7c9c9', background: '#fdf6f5' }}>
        <p className="muted" style={{ fontSize: 12 }}>
          Videos must not contain nudity or sexual content, hate speech, harassment, excessive profanity, violence, illegal activity, copyright infringement, misinformation or spam.
        </p>
        <List items={[
          <>Repeated violations → video rejection &amp; loss of earnings.</>,
          <>Serious or repeated breaches → suspension or <b>permanent ban</b> from Post &amp; Earn.</>,
        ]}
        />
      </Card>

      <Card title="Content usage rights">
        <p className="muted" style={{ fontSize: 12 }}>
          By joining Post &amp; Earn you grant Together City a worldwide, non-exclusive, royalty-free licence to use approved paid videos for promotion — on Together City and external platforms (Instagram, YouTube, Facebook, X, LinkedIn), digital ads, campaigns and marketing materials.
        </p>
      </Card>

      <Card title="Your videos">
        {rows.map((x) => (
          <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span>{x.caption.slice(0, 42)}</span>
            <span className="muted">
              {dur(x.dur)} video · {x.dur >= 180
                ? <b style={{ color: '#2e7d46' }}>Approved · {money(PAY_PER_VIDEO)}</b>
                : <span style={{ color: '#b4691f' }}>Not eligible</span>}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Social Life · My Profile — your story, stats, badges and Post & Earn. */
export function SocialProfile() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'posts' | 'earn'>('posts');

  const name = user?.name ?? 'You';
  const handle = user ? `@${(user as { handle?: string }).handle ?? name.split(' ')[0].toLowerCase()}` : '@you';
  const mail = useMemo(() => `${handle.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@togethercity.tech`, [handle]);

  const posts = MY_POSTS.length;
  const followers = useFollowers().data?.length ?? 0;
  const following = useFollowing().data?.length ?? 0;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--serif)', fontSize: 32, flexShrink: 0, background: 'var(--accent)' }}>
          {initials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24 }}>{name}</h1>
            <Link className="btn btn-line btn-sm" to="/social/profile">Edit profile</Link>
            <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>{handle} · Together City member</p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>✉ <a href={`mailto:${mail}`} style={{ color: 'inherit' }}>{mail}</a></p>
          <div style={{ display: 'flex', gap: 28, margin: '10px 0' }}>
            {[[posts, 'posts'], [followers, 'followers'], [following, 'following']].map(([n, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <b style={{ fontSize: 18, display: 'block' }}>{n}</b>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rise d1" style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="button" className={`pill ${tab === 'posts' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('posts')}>Posts</button>
        <button type="button" className={`pill ${tab === 'earn' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('earn')}>💰 Post &amp; Earn</button>
      </div>

      {tab === 'posts' ? (
        <>
          <div className="blk-head rise d1" style={{ marginTop: 16 }}>
            <h2>Your posts</h2>
            <span className="muted" style={{ fontSize: 12 }}>{posts} post{posts === 1 ? '' : 's'}</span>
          </div>
          <div className="rise d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {MY_POSTS.map((p) => (
              <Link key={p.id} to="/social/feed" style={{ position: 'relative', display: 'block' }}>
                <MediaTile p={p} />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="rise d1" style={{ marginTop: 16 }}><EarnView /></div>
      )}
    </div>
  );
}
