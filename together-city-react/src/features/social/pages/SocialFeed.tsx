import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { PostCard, Avatar } from '../PostCard';
import { PublicProfileModal } from './Profile';
import { useCreatePost, useFeed, type Post } from '../api';

/** Inline composer — text posts right here; anything richer opens the full
 *  Create Post composer (photos, video, check-ins, tags…). */
function Composer() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<'public' | 'friends' | 'family' | 'private'>('public');
  const create = useCreatePost();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    create.mutate({ text: text.trim(), audience }, { onSuccess: () => setText('') });
  };

  const toolBtn = (label: string) => (
    <button key={label} type="button" onClick={() => nav('/social/create')}
      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '7px 11px',
        borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Avatar name={user?.name ?? 'You'} src={user?.profileImage} />
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="What's happening today? Share a thought, photo, video or moment with your city."
          style={{ flex: 1, border: 'none', outline: 'none', resize: 'vertical', padding: '8px 0 0',
            fontSize: 14.5, fontFamily: 'inherit', background: 'transparent', color: 'var(--ink)', lineHeight: 1.5 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
        {toolBtn('📷 Photo')}
        {toolBtn('🎥 Video')}
        {toolBtn('📍 Location')}
        {toolBtn('😊 Mood')}
        <select value={audience} onChange={(e) => setAudience(e.target.value as never)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '7px 9px', borderRadius: 999,
            border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer' }}>
          <option value="public">🌍 Public</option>
          <option value="friends">👥 Friends</option>
          <option value="family">👨‍👩‍👧 Family</option>
          <option value="private">🔒 Only Me</option>
        </select>
        <div style={{ marginLeft: 'auto' }}>
          <Button type="submit" variant="accent" size="sm" disabled={create.isPending || !text.trim()}>
            {create.isPending ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
      {create.isError && (
        <p role="alert" style={{ color: '#c0392b', fontSize: 12.5, margin: '8px 0 0' }}>
          Couldn't post that just now — please try again.
        </p>
      )}
    </form>
  );
}

const FILTERS = [
  { key: 'foryou', label: 'For You' },
  { key: 'photos', label: '📷 Photos' },
  { key: 'videos', label: '🎥 Videos' },
  { key: 'friends', label: 'Friends' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'trending', label: 'Trending' },
  { key: 'following', label: 'Following' },
] as const;

const FALLBACK_TAGS = ['#Weekend', '#Coffee', '#Mumbai', '#Fitness'];

/** Right sidebar (desktop) — trending, events, people, businesses. */
function Sidebar({ posts }: { posts: Post[] }) {
  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) for (const m of (p.text ?? '').match(/#\w+/g) ?? []) counts.set(m, (counts.get(m) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    return top.length >= 2 ? top : [...top, ...FALLBACK_TAGS.filter((t) => !top.includes(t))].slice(0, 4);
  }, [posts]);
  const box: React.CSSProperties = { padding: '14px 16px', marginBottom: 14 };
  const head: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 };
  const row: React.CSSProperties = { fontSize: 13, padding: '5px 0', display: 'block', color: 'var(--ink)', textDecoration: 'none' };
  return (
    <aside>
      <div className="card" style={box}>
        <div style={head}>Trending</div>
        {trending.map((t) => <span key={t} style={{ ...row, fontWeight: 700, color: 'var(--accent)' }}>{t}</span>)}
      </div>
      <div className="card" style={box}>
        <div style={head}>Nearby events</div>
        {[['🎸 Live Music', '/entertainment'], ['🍜 Food Festival', '/restaurants'], ['🏃 City Marathon', '/fitness']].map(([l, to]) => (
          <Link key={l} to={to} style={row}>{l}</Link>
        ))}
      </div>
      <div className="card" style={box}>
        <div style={head}>Suggested people</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>Grow your circle — connect once, share everywhere.</p>
        <Link to="/connections" className="btn btn-line btn-sm">Open People →</Link>
      </div>
      <div className="card" style={box}>
        <div style={head}>Businesses near you</div>
        {[['☕ Blue Tokai', '/restaurants'], ['🥤 Starbucks', '/restaurants'], ['🍽 Explore restaurants', '/restaurants/discover']].map(([l, to]) => (
          <Link key={l} to={to} style={row}>{l}</Link>
        ))}
      </div>
    </aside>
  );
}

/** Social Life — one intelligent feed: friends, check-ins, travel moments,
 *  videos, business updates and community posts in a single clean stream. */
export function SocialFeed() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('foryou');
  const feed = useFeed(filter);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const [authorHandle, setAuthorHandle] = useState<string | null>(null);

  // Post-share landing: highlight the new post, scroll to top, flash a toast.
  const navState = location.state as { newPostId?: string; justShared?: boolean } | null;
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!navState?.justShared) return;
    setNewPostId(navState.newPostId ?? null);
    setToast(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Clear router state so a refresh/back doesn't re-trigger the toast.
    navigate(location.pathname, { replace: true, state: null });
    const t1 = window.setTimeout(() => setToast(false), 3000);
    const t2 = window.setTimeout(() => setNewPostId(null), 12000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      {toast && (
        <div role="status" style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
          background: '#1f7a46', color: '#fff', borderRadius: 999, padding: '11px 20px', fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,.28)', animation: 'tc-rise .3s ease-out', display: 'flex', alignItems: 'center', gap: 8 }}>
          ✓ Your post has been shared to your city.
        </div>
      )}
      <div className="eyebrow">Social Life</div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>
        {user ? `What's happening, ${user.name.split(' ')[0]}` : 'The city feed'}
      </h1>
      <p className="lede" style={{ marginBottom: 16 }}>Discover what's happening around you.</p>

      <div className="feed-grid" style={{ display: 'grid', gap: 24, alignItems: 'start' }}>
        <div>
          <Composer />

          {/* Filters — wrap to fit instead of horizontal scrolling */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '7px 16px',
                  borderRadius: 999, border: `1.5px solid ${filter === f.key ? 'var(--accent)' : 'var(--line)'}`,
                  background: filter === f.key ? 'var(--accent)' : 'var(--card)',
                  color: filter === f.key ? '#fff' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                {f.label}
              </button>
            ))}
          </div>

          {feed.isLoading && <Spinner label="Loading the city feed…" />}
          {feed.isError && <EmptyState title="Couldn't load the feed" hint="Reload in a moment." />}
          {!feed.isLoading && !feed.isError && items.length === 0 && (
            <EmptyState icon="🌆" title={filter === 'foryou' ? 'No moments yet' : 'Nothing here yet'}
              hint={filter === 'nearby' ? 'Posts with a pinned location appear here.' : filter === 'following' ? 'Follow people to fill this lens.' : 'Be the first to share one.'} />
          )}
          {items.map((p) => <PostCard key={p.key ?? p.id} post={p} isNew={p.id === newPostId} onOpenAuthor={setAuthorHandle} autoplayVideo={filter === 'videos'} />)}

          {feed.hasNextPage && (
            <div style={{ display: 'grid', placeItems: 'center', margin: '18px 0 4px' }}>
              <Button variant="line" size="sm" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
                {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>

        {/* Right sidebar — desktop only (CSS media query) */}
        <div className="feed-sidebar">
          <Sidebar posts={items} />
        </div>
      </div>

      {authorHandle && <PublicProfileModal handle={authorHandle} onClose={() => setAuthorHandle(null)} />}
    </div>
  );
}
