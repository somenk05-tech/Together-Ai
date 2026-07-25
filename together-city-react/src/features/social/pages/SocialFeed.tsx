import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import {
  useAddComment, useComments, useCreatePost, useFeed, useToggleLike, useDeletePost, useUpdatePost, type Post,
} from '../api';

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  if (src) return <img src={src} alt={name} width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div className="tc-avatar" style={{
      width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
      background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 14, flexShrink: 0,
    }}>
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

const AUD_EMOJI: Record<string, string> = { public: '🌍', friends: '👥', family: '👨‍👩‍👧', private: '🔒' };

/** 🔖 Saved posts — lightweight local bookmarks (persisted on this device). */
const SAVED_KEY = 'tc-saved-posts';
function savedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function toggleSaved(post: Post): boolean {
  const ids = savedIds();
  const on = !ids.has(post.id);
  if (on) ids.add(post.id); else ids.delete(post.id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
    const snaps = JSON.parse(localStorage.getItem(SAVED_KEY + '-data') ?? '{}') as Record<string, unknown>;
    if (on) snaps[post.id] = post; else delete snaps[post.id];
    localStorage.setItem(SAVED_KEY + '-data', JSON.stringify(snaps));
  } catch { /* storage full — ignore */ }
  return on;
}

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

function CommentsPanel({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate({ postId, text: text.trim() }, { onSuccess: () => setText('') });
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      {comments.isLoading && <Spinner />}
      {(comments.data ?? []).map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <Avatar name={c.author.name} src={c.author.profileImage} />
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.author.name}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{timeAgo(c.createdAt)}</span>
            <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
          </div>
        </div>
      ))}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
        <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
      </form>
    </div>
  );
}

/** A single feed image. When it's the only image, the frame adapts to the
 *  photo's orientation (16:9 landscape or 9:16 vertical); in a grid it stays 16:9. */
function ImgCell({ url, adaptive, overlay, alt }: { url: string; adaptive: boolean; overlay?: React.ReactNode; alt: string }) {
  const [portrait, setPortrait] = useState(false);
  return (
    <div style={{ position: 'relative', aspectRatio: adaptive && portrait ? '9 / 16' : '16 / 9', maxHeight: adaptive ? 560 : undefined, background: '#000' }}>
      <img src={url} alt={alt} onLoad={(e) => { if (adaptive) setPortrait(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth); }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {overlay}
    </div>
  );
}

/** A feed video framed 16:9 (landscape) or 9:16 (vertical) by its real dimensions. */
function VideoFrame({ url, isNew }: { url: string; isNew: boolean }) {
  const [portrait, setPortrait] = useState(false);
  return (
    <video src={url} controls playsInline autoPlay={isNew} muted={isNew} loop={isNew}
      onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
      style={{ width: '100%', aspectRatio: portrait ? '9 / 16' : '16 / 9', maxHeight: 560, objectFit: 'cover', borderRadius: 14, marginTop: 12, background: '#000', display: 'block' }} />
  );
}

/** One clean card for every kind of post — photo, video, check-in, text.
 *  `isNew` marks a just-posted item: a "New" chip, "Just now", auto-playing video. */
function PostCard({ post, isNew = false }: { post: Post; isNew?: boolean }) {
  const like = useToggleLike();
  const del = useDeletePost();
  const upd = useUpdatePost();
  const { user } = useAuth();
  const isMine = Boolean(user && (user.id === post.author.id || user.handle === post.author.handle));
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text ?? '');
  const [showComments, setShowComments] = useState(false);
  const [saved, setSaved] = useState(() => savedIds().has(post.id));
  const [shareOpen, setShareOpen] = useState(false);
  const actionStyle = (on = false): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit',
    color: on ? 'var(--accent)' : 'var(--muted)', fontWeight: on ? 700 : 400, padding: 0,
  });

  const images = post.media.filter((m) => m.kind === 'image');
  const videos = post.media.filter((m) => m.kind === 'video');
  const aud = post.audience && post.audience !== 'public' ? AUD_EMOJI[post.audience] : null;

  // A rich card for sharing this post into a Together City chat (reuses the
  // cross-hub Send-to-Chat primitive), so "Share" actually sends it to people.
  const shareCard: ShareCard = {
    kind: 'post',
    hub: 'Social',
    title: post.text?.trim() ? (post.text.length > 90 ? post.text.slice(0, 90) + '…' : post.text) : `${post.author.name}'s post`,
    subtitle: `by ${post.author.name}${post.placeName ? ` · 📍 ${post.placeName}` : ''}`,
    image: images[0]?.url ?? videos[0]?.thumbUrl ?? null,
    deepLink: '/social/feed',
  };

  return (
    <article className="card" style={{ marginBottom: 16, ...(isNew ? { boxShadow: '0 0 0 2px var(--accent)', animation: 'tc-pop .3s ease-out' } : {}) }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar name={post.author.name} src={post.author.profileImage} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {post.author.name}
            <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> @{post.author.handle}</span>
            {aud && <span title={post.audience} style={{ fontSize: 12, marginLeft: 6 }}>{aud}</span>}
            {isNew && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '2px 8px', marginLeft: 8 }}>New</span>}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {isNew ? 'Just now' : `${timeAgo(post.createdAt)} ago`}
            {post.feeling ? ` · feeling ${post.feeling}` : ''}
          </div>
          {post.placeName && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 }}>📍 {post.placeName}</div>
          )}
        </div>
        {isMine && (
          <div style={{ position: 'relative', flex: 'none' }}>
            <button type="button" aria-label="Post options" onClick={() => setMenuOpen((o) => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--muted)', padding: '2px 6px' }}>⋯</button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 21, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,.16)', overflow: 'hidden', minWidth: 150 }}>
                  <button type="button" onClick={() => { setDraft(post.text ?? ''); setEditing(true); setMenuOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--ink)' }}>✏️ Edit post</button>
                  <button type="button" disabled={del.isPending}
                    onClick={() => { setMenuOpen(false); if (window.confirm('Delete this post? This cannot be undone.')) del.mutate(post.id); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: '#c0392b' }}>🗑 Delete post</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {(post.tagged?.length ?? 0) > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          with {post.tagged!.map((t) => t.name).join(', ')}
        </p>
      )}

      {/* media-first: single image full-bleed, several as a clean grid */}
      {images.length > 0 && (
        <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden',
          display: 'grid', gap: 3, gridTemplateColumns: images.length > 1 ? '1fr 1fr' : '1fr' }}>
          {images.slice(0, 4).map((m, i) => (
            <ImgCell key={m.id} url={m.url} adaptive={images.length === 1} alt={`Photo shared by ${post.author.name}`}
              overlay={i === 3 && images.length > 4 ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>
                  +{images.length - 4}
                </div>
              ) : null} />
          ))}
        </div>
      )}
      {videos.map((m) => <VideoFrame key={m.id} url={m.url} isNew={isNew} />)}

      {editing ? (
        <div style={{ marginTop: 12 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2200} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={upd.isPending}
              onClick={() => upd.mutate({ postId: post.id, text: draft }, { onSuccess: () => setEditing(false) })}
              className="btn btn-accent btn-sm">{upd.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(post.text ?? ''); }} className="btn btn-line btn-sm">Cancel</button>
          </div>
        </div>
      ) : (
        post.text && <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{post.text}</p>
      )}

      <div style={{ display: 'flex', gap: 20, marginTop: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => like.mutate(post.id)} style={actionStyle(post.likedByMe)}>
          {post.likedByMe ? '❤️' : '🤍'} {post.likes}
        </button>
        <button type="button" onClick={() => setShowComments((s) => !s)} style={actionStyle()}>
          💬 {post.comments}
        </button>
        <button type="button" onClick={() => setShareOpen(true)} style={actionStyle()}>↗ Share</button>
        <button type="button" onClick={() => setSaved(toggleSaved(post))} style={actionStyle(saved)}>
          🔖 {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {showComments && <CommentsPanel postId={post.id} />}
      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
    </article>
  );
}

const FILTERS = [
  { key: 'foryou', label: 'For You' },
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

          {/* Filters — the only five you need */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
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
          {items.map((p) => <PostCard key={p.id} post={p} isNew={p.id === newPostId} />)}

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
    </div>
  );
}
