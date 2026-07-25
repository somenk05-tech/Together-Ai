import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@/components/ui';
import { chatApi } from '@/api';
import { useConnections, useRequestConnection, useRespondConnection } from '@/api/connections.api';
import { profileApi } from '@/features/profile/api';
import { useAuthStore } from '@/store/auth.store';
import { initials } from '../shared';
import {
  useMyProfile, useMyPosts, usePeopleSearch, usePublicProfile, useUpdateProfile, useReorderMyPosts,
  type MyProfile, type ProfilePost, type PersonResult, type PublicProfile, type Relationship,
} from '../myProfile.api';
import { useFollowers, useFollowing, useFollow, useUnfollow, useBlock, useReport, useSetCover, useSetPostCategory, type FollowPerson, type Post } from '../api';
import { PostCard } from '../PostCard';

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const PAY_PER_VIDEO = 100;
const DAILY_CAP = 15;

/** Resize a chosen image to a small square JPEG data URL (no external storage needed). */
function resizeToDataUrl(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

function Avatar({ src, name, size = 96 }: { src?: string | null; name: string; size?: number }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--serif)', fontSize: size / 3, flexShrink: 0, background: 'var(--accent)' }}>
      {initials(name)}
    </div>
  );
}

/** Blue verified check — shown when the account's email is verified. */
function VerifiedBadge() {
  return (
    <span title="Verified member" aria-label="Verified" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#2f8fce', color: '#fff', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>✓</span>
  );
}

function StatCell({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <b style={{ fontSize: 20, display: 'block' }}>{n.toLocaleString('en-IN')}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}

function tileDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** One post in the profile grid. Videos show only a lightweight POSTER (their
 *  thumbnail) or a placeholder with a play button — the actual video is never
 *  loaded here, only when the post is opened in the lightbox. This keeps the
 *  profile from downloading every video on load. */
function PostTile({ p }: { p: ProfilePost }) {
  const first = p.media[0];
  const isVideo = first?.kind === 'video';
  // For videos, only a thumbnail image is ever loaded here (never the video file).
  const imgSrc = isVideo ? (first?.thumbUrl ?? null) : (first ? (first.thumbUrl || first.url) : null);
  return (
    <div style={{ aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', position: 'relative', background: 'var(--paper)' }}>
      {imgSrc ? (
        <img src={imgSrc} alt={p.text ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', background: isVideo ? '#000' : undefined }} />
      ) : isVideo && first ? (
        // No server thumbnail — show a STILL FRAME via preload="metadata" seeked
        // to 0.1s (#t=0.1). The browser fetches only metadata + that one frame,
        // not the whole video, and it never plays here (muted, no autoplay).
        <video src={`${first.url}#t=0.1`} preload="metadata" muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center', fontSize: 13, lineHeight: 1.4, color: '#fff', background: 'linear-gradient(140deg,var(--accent),#7a4fa0)' }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.feeling ? `${p.feeling} · ` : ''}{p.text || 'Post'}</span>
        </div>
      )}
      {isVideo && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, margin: 'auto', width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: 18, paddingLeft: 3 }}>▶</span>
      )}
      {p.outdoor && <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 14 }}>📍</span>}
      {/* Work/Personal category badge (when the post has been sorted) */}
      {(p.category === 'personal' || p.category === 'work') && (
        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '1px 7px' }}>
          {p.category === 'work' ? '💼 Work' : '🏖 Personal'}
        </span>
      )}
      {/* Every post shows its date */}
      <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 6, padding: '1px 7px' }}>
        {tileDate(p.createdAt)}
      </span>
    </div>
  );
}

/** Map the profile's ProfilePost into the full feed Post shape so the profile
 *  can render the exact same PostCard (like / comment / share / save / play /
 *  edit / delete) as the city feed. */
function profilePostToPost(p: ProfilePost, me?: { id: string; handle: string; name: string; profileImage: string | null }): Post {
  const author = p.author ?? me ?? { id: '', handle: '', name: 'You', profileImage: null };
  return {
    id: p.id,
    text: p.text,
    feeling: p.feeling,
    audience: p.audience ?? 'public',
    placeName: p.placeName ?? null,
    tagged: p.tagged ?? [],
    lat: null,
    lng: null,
    author,
    media: p.media.map((m) => ({ id: `${p.id}:${m.url}`, url: m.url, kind: (m.kind === 'video' ? 'video' : 'image'), thumbUrl: m.thumbUrl })),
    likes: p.likeCount,
    comments: p.commentCount,
    likedByMe: p.likedByMe ?? false,
    createdAt: p.createdAt,
  };
}

/** Opens a post in place ON the profile page as the full feed card (video plays
 *  with controls, plus like/comment/share/save and Edit/Delete), so viewing or
 *  managing a post never bounces the user to the city feed. */
function PostLightbox({ post, category, onClose }: { post: Post; category?: string | null; onClose: () => void }) {
  const setCover = useSetCover();
  const setCategory = useSetPostCategory();
  const cur = category ?? '';
  const choose = (c: 'work' | 'personal' | null) => setCategory.mutate({ postId: post.id, category: c });
  const chip = (key: '' | 'personal' | 'work', label: string) => (
    <button key={key || 'none'} type="button" disabled={setCategory.isPending}
      onClick={() => choose(key === '' ? null : key)}
      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
        border: `1.5px solid ${cur === key ? 'var(--accent)' : 'var(--line)'}`,
        background: cur === key ? 'var(--accent)' : 'var(--card)', color: cur === key ? '#fff' : 'var(--ink)' }}>
      {label}
    </button>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.62)', display: 'grid', placeItems: 'start center', padding: 16, zIndex: 70, overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(600px,96vw)', margin: 'auto 0' }}>
        <PostCard post={post} manage
          onSetCover={(t) => setCover.mutate({ postId: post.id, time: t })}
          coverBusy={setCover.isPending} />
        <div className="card" style={{ margin: '8px 0', padding: '12px 14px', border: '1.5px solid var(--accent)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
            📂 Sort this post {setCategory.isPending && <span className="muted" style={{ fontWeight: 500 }}>· Saving…</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {chip('', 'None')}
            {chip('personal', '🏖 Personal')}
            {chip('work', '💼 Work')}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={onClose} className="btn btn-line btn-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

function PostsTab({ filter = 'all', category = 'all' }: { filter?: 'all' | 'photo' | 'video'; category?: 'all' | 'work' | 'personal' }) {
  const posts = useMyPosts();
  const reorder = useReorderMyPosts();
  const me = useMyProfile();
  const [openId, setOpenId] = useState<string | null>(null);
  const matchesFilter = (p: ProfilePost) => {
    const hasVideo = p.media.some((m) => m.kind === 'video');
    const hasImage = p.media.some((m) => m.kind === 'image');
    if (filter === 'video' && !hasVideo) return false;
    if (filter === 'photo' && !(hasImage && !hasVideo)) return false;
    if (category !== 'all' && (p.category ?? '') !== category) return false;
    return true;
  };
  const canArrange = true; // rearrange works on every posts tab
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);

  // Drag-to-arrange state. `arranged` holds the working order while editing.
  const [arranging, setArranging] = useState(false);
  const [arranged, setArranged] = useState<ProfilePost[]>([]);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Infinite scroll — fetch the next page when the sentinel scrolls into view.
  // (Paused while arranging so the working list doesn't shift underfoot.)
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !posts.hasNextPage || arranging) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !posts.isFetchingNextPage) void posts.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts.hasNextPage, posts.isFetchingNextPage, posts, arranging]);

  if (posts.isLoading) return <Spinner label="Loading your posts…" />;

  const count = items.length;
  if (!count) {
    return (
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 16 }}>
        <div style={{ fontSize: 38, marginBottom: 8 }}>🌆</div>
        <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>No posts yet</h2>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>Share a photo, video or thought with your city.</p>
        <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
      </div>
    );
  }

  const startArranging = () => { setArranged(items.filter(matchesFilter)); setArranging(true); };
  const cancelArranging = () => { setArranging(false); setArranged([]); dragFrom.current = null; setDragOver(null); };
  const saveArranging = () => {
    // Weave the reordered (filtered) items back into the full post order, leaving
    // posts outside this tab where they are — so rearranging Photos doesn't
    // disturb videos/text posts in the "Posts" tab.
    const newIds = arranged.map((p) => p.id);
    let k = 0;
    const fullOrder = items.map((p) => (matchesFilter(p) ? newIds[k++] : p.id));
    reorder.mutate(fullOrder, { onSuccess: () => { setArranging(false); setArranged([]); } });
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    setArranged((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const view = items.filter(matchesFilter);
  const grid = arranging ? arranged : view;
  const noun = filter === 'photo' ? 'photo' : filter === 'video' ? 'video' : 'post';
  const title = category === 'work' ? 'Work' : category === 'personal' ? 'Personal'
    : filter === 'photo' ? 'Your photos' : filter === 'video' ? 'Your videos' : 'Your posts';

  return (
    <>
      <div className="blk-head rise d1" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!arranging ? (
            <>
              <span className="muted" style={{ fontSize: 12 }}>{view.length} {noun}{view.length === 1 ? '' : 's'}{posts.hasNextPage ? '+' : ''}</span>
              {canArrange && view.length > 1 && <Button variant="line" size="sm" onClick={startArranging}>↕ Rearrange</Button>}
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 12 }}>Drag posts to reorder</span>
              <Button variant="line" size="sm" onClick={cancelArranging} disabled={reorder.isPending}>Cancel</Button>
              <Button variant="accent" size="sm" onClick={saveArranging} disabled={reorder.isPending}>{reorder.isPending ? 'Saving…' : 'Save order'}</Button>
            </>
          )}
        </div>
      </div>

      {arranging && posts.hasNextPage && (
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Arranging the {view.length} loaded posts. Scroll to load all posts before rearranging if you want to move older ones.
        </p>
      )}

      {view.length === 0 && (
        <div className="blk rise d1" style={{ textAlign: 'center', padding: '44px 24px', marginTop: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{filter === 'video' ? '🎬' : '🖼'}</div>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>No {noun}s yet.</p>
        </div>
      )}

      <div className="rise d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {grid.map((p, i) => (
          arranging ? (
            <div
              key={p.id}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null; setDragOver(null); }}
              onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
              style={{
                position: 'relative', cursor: 'grab', touchAction: 'none',
                outline: dragOver === i ? '2px solid var(--accent)' : 'none', outlineOffset: 2, borderRadius: 8,
                opacity: dragFrom.current === i ? 0.5 : 1,
              }}
            >
              <PostTile p={p} />
              <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 14, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 6, padding: '0 6px', lineHeight: 1.6 }}>⠿</span>
            </div>
          ) : (
            <button key={p.id} type="button" onClick={() => setOpenId(p.id)}
              style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
              <PostTile p={p} />
            </button>
          )
        ))}
      </div>
      {!arranging && <div ref={sentinel} style={{ height: 1 }} />}
      {!arranging && posts.isFetchingNextPage && <div style={{ padding: 16 }}><Spinner /></div>}
      {(() => {
        const op = openId ? items.find((x) => x.id === openId) : null;
        // Driven by live items: if the post is edited/deleted, the lightbox
        // reflects it (and closes when the post is gone).
        return op ? <PostLightbox post={profilePostToPost(op, me.data)} category={op.category} onClose={() => setOpenId(null)} /> : null;
      })()}
    </>
  );
}

/** Connect / Accept / Message action for a person — shared by search rows and the profile modal. */
function ConnectButton({ id, handle, relationship }: { id: string; handle: string; relationship: Relationship }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connections = useConnections();
  const requestConn = useRequestConnection();
  const respondConn = useRespondConnection();
  const [rel, setRel] = useState<Relationship>(relationship);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRel(relationship), [relationship]);

  const connect = async () => { try { await requestConn.mutateAsync(handle); setRel('pending_out'); } catch { /* keep state */ } };
  const accept = async () => {
    const row = (connections.data ?? []).find((c) => c.user.id === id && c.status === 'pending');
    if (!row) { navigate('/connections'); return; }
    try { await respondConn.mutateAsync({ id: row.id, accept: true }); setRel('accepted'); } catch { /* keep */ }
  };
  const message = async () => {
    setBusy(true);
    try {
      const conv = await chatApi.startDirect(handle);
      await qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      navigate(`/chats?c=${conv.id}`);
    } catch { /* connected users only */ } finally { setBusy(false); }
  };

  if (rel === 'accepted') return <Button variant="accent" size="sm" disabled={busy} onClick={message}>{busy ? '…' : 'Message'}</Button>;
  if (rel === 'pending_out') return <Button variant="line" size="sm" disabled>Requested</Button>;
  if (rel === 'pending_in') return <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={accept}>Accept</Button>;
  if (rel === 'blocked') return <Button variant="line" size="sm" disabled>Unavailable</Button>;
  return <Button variant="accent" size="sm" disabled={requestConn.isPending} onClick={connect}>Connect</Button>;
}

/** Block / Report safety actions for a person, shown in their profile modal. */
function SafetyActions({ id, handle, onBlocked }: { id: string; handle: string; onBlocked: () => void }) {
  const block = useBlock();
  const report = useReport();
  const [reported, setReported] = useState(false);

  const doBlock = () => {
    if (!window.confirm(`Block @${handle}? They won't be able to see your posts or interact with you, and you won't see theirs.`)) return;
    block.mutate({ userId: id }, { onSuccess: onBlocked });
  };
  const doReport = () => {
    const reason = window.prompt(`Report @${handle}? Optionally tell us what's wrong (spam, harassment, etc.):`, '');
    if (reason === null) return; // cancelled
    report.mutate({ targetType: 'user', targetId: id, reason: reason || undefined }, { onSuccess: () => setReported(true) });
  };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginRight: 'auto' }}>
      <button type="button" onClick={doBlock} disabled={block.isPending}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: '#c0392b', padding: 0 }}>
        {block.isPending ? 'Blocking…' : '🚫 Block'}
      </button>
      <button type="button" onClick={doReport} disabled={report.isPending || reported}
        style={{ background: 'none', border: 'none', cursor: reported ? 'default' : 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--muted)', padding: 0 }}>
        {reported ? '✓ Reported' : '⚑ Report'}
      </button>
    </div>
  );
}

export function PublicProfileModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const q = usePublicProfile(handle);
  const p = q.data as PublicProfile | undefined;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(460px,94vw)', maxHeight: '86vh', overflow: 'auto' }}>
        {q.isLoading && <Spinner label="Loading profile…" />}
        {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load that profile.</p>}
        {p && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar src={p.profileImage} name={p.name} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h3 style={{ margin: 0, fontSize: 19 }}>{p.name}</h3>{p.verified && <VerifiedBadge />}
                </div>
                <div className="muted" style={{ fontSize: 12.5, fontFamily: 'monospace' }}>@{p.handle}</div>
                {p.city && <div className="muted" style={{ fontSize: 12 }}>📍 {p.city}</div>}
              </div>
            </div>
            {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' }}>{p.bio}</p>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)' }}>{p.website.replace(/^https?:\/\//, '')}</a>}
            <div style={{ display: 'flex', gap: 22, margin: '14px 0' }}>
              <StatCell n={p.stats.posts} label="posts" />
              <StatCell n={p.stats.cityPoints} label="city points" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <SafetyActions id={p.id} handle={p.handle} onBlocked={onClose} />
              <Button variant="line" size="sm" onClick={onClose}>Close</Button>
              <ConnectButton id={p.id} handle={p.handle} relationship={p.relationship} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeopleTab() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 220); return () => clearTimeout(t); }, [q]);
  const search = usePeopleSearch(dq);
  const results = (search.data ?? []) as PersonResult[];

  return (
    <div className="rise d1" style={{ marginTop: 16 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 4px' }}>Find people</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Search by name, @handle or Together City ID, then connect.</p>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
          <span className="muted">🔍</span>
          <input value={q} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQ(e.target.value)} placeholder="Search name or @handle"
            style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {dq.trim().length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {search.isLoading && <Spinner />}
            {!search.isLoading && results.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No members match “{dq}”.</p>}
            {results.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderTop: '1px solid var(--line)' }}>
                <Avatar src={r.profileImage} name={r.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>{r.verified && <VerifiedBadge />}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <span style={{ fontFamily: 'monospace' }}>@{r.handle}</span>{r.city ? ` · ${r.city}` : ''}
                  </div>
                </div>
                <Button variant="line" size="sm" onClick={() => setOpen(r.handle)}>View</Button>
                <ConnectButton id={r.id} handle={r.handle} relationship={r.relationship} />
              </div>
            ))}
          </div>
        )}
      </div>
      {open && <PublicProfileModal handle={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EditProfileModal({ me, onClose }: { me: MyProfile; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(me.profileImage);
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio ?? '');
  const [city, setCity] = useState(me.city ?? '');
  const [website, setWebsite] = useState(me.website ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const data = await resizeToDataUrl(file);
      const res = await profileApi.setAvatar(data);
      const nextPhoto = res?.profileImage ?? data;
      setPhoto(nextPhoto);
      // Sync the auth store so the header + feed composer avatars update too.
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profileImage: nextPhoto } : s.user }));
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch { setErr('Could not update the photo — try a smaller image.'); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await update.mutateAsync({ name, handle, bio, city, website });
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(typeof msg === 'string' ? msg : 'Could not save — check your details and try again.');
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: '100%', padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 5px' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(500px,94vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="blk-head"><h3>Edit profile</h3></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <Avatar src={photo} name={name} size={64} />
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="line" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Change photo</Button>
            <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Square JPG/PNG, saved instantly.</p>
          </div>
        </div>

        <label style={label}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={field} maxLength={80} />

        <label style={label}>Handle</label>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 10px' }}>
          <span className="muted">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '11px 6px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} maxLength={30} />
        </div>

        <label style={label}>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} style={{ ...field, resize: 'vertical' }} placeholder="A line about you" />

        <label style={label}>City</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} style={field} maxLength={80} placeholder="e.g. Mumbai" />

        <label style={label}>Website</label>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} style={field} placeholder="https://…" />

        {err && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="line" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="accent" size="sm" onClick={save} disabled={busy || !name.trim() || handle.length < 3}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}

function EarnView({ posts }: { posts: ProfilePost[] }) {
  const videos = posts.filter((p) => p.media.some((m) => m.kind === 'video'));
  const dailyCapInr = PAY_PER_VIDEO * DAILY_CAP;
  const TOPICS = [
    'Your life & personal journey', 'Your daily routine', 'Food reviews & cooking', 'Restaurants & cafés',
    'Health & fitness', 'Beauty & skincare', 'Travel experiences', 'Movies & entertainment',
    'Career & work life', 'Personal growth', 'Family & friendships', 'Hobbies & passions',
  ];
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,var(--accent),#7a4fa0)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: '22px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '.05em' }}>Redeemable balance</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 38, lineHeight: 1 }}>{money(0)}</div>
        <div style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>Earn by publishing eligible videos — up to {money(PAY_PER_VIDEO)} each, {money(dailyCapInr)}/day.</div>
      </div>

      <div className="card">
        <div className="blk-head"><h3>Turn your stories into earnings</h3></div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Share authentic videos about your life and interests while helping others discover Together City.
          Once reviewed &amp; approved, each eligible video (3+ minutes) can earn up to <b>{money(PAY_PER_VIDEO)}</b>.
        </p>
        <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{videos.length}</div><div className="muted" style={{ fontSize: 11 }}>videos posted</div></div>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{money(0)}</div><div className="muted" style={{ fontSize: 11 }}>earned</div></div>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{money(0)}</div><div className="muted" style={{ fontSize: 11 }}>redeemed</div></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>What can you make videos about?</h3></div>
        <div style={{ marginTop: 10 }}>
          {TOPICS.map((t) => (
            <span key={t} style={{ display: 'inline-block', background: 'var(--surface-2,#f2eee9)', border: '1px solid var(--line,#e5ddd3)', borderRadius: 999, padding: '5px 11px', fontSize: 12, margin: '0 6px 6px 0' }}>{t}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>Your videos</h3></div>
        {videos.length === 0
          ? <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No videos yet. Post a video to start earning.</p>
          : videos.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text || v.feeling || 'Video post'}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>In review</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/** One row in the Followers / Following list, with a live Follow / Following /
 *  Follow-back action wired to the real follow graph. */
function FollowRow({ person, onView }: { person: FollowPerson; onView: () => void }) {
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;
  const label = person.iFollow ? 'Following' : person.followsMe ? 'Follow back' : 'Follow';
  const act = () => {
    if (busy) return;
    if (person.iFollow) unfollow.mutate(person.id);
    else follow.mutate({ userId: person.id });
  };
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
      <button type="button" onClick={onView} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
        <Avatar src={person.profileImage} name={person.name} size={44} />
      </button>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onView}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name}</div>
        <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>@{person.handle}{person.followsMe && !person.iFollow ? ' · follows you' : ''}</div>
      </div>
      <Button variant={person.iFollow ? 'line' : 'accent'} size="sm" disabled={busy} onClick={act}>
        {busy ? '…' : label}
      </Button>
    </div>
  );
}

function FollowList({ kind }: { kind: 'followers' | 'following' }) {
  const followers = useFollowers();
  const following = useFollowing();
  const [view, setView] = useState<string | null>(null);
  const q = kind === 'followers' ? followers : following;
  const people = q.data ?? [];
  if (q.isLoading) return <div style={{ marginTop: 16 }}><Spinner label={`Loading ${kind}…`} /></div>;
  if (!people.length) {
    return (
      <p className="muted" style={{ fontSize: 13.5, marginTop: 20 }}>
        {kind === 'followers' ? 'No followers yet — share posts and connect with people to grow your circle.' : "You're not following anyone yet. Find people to follow below."}
      </p>
    );
  }
  return (
    <div className="rise d1" style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 560 }}>
      {people.map((person) => <FollowRow key={person.id} person={person} onView={() => setView(person.handle)} />)}
      {view && <PublicProfileModal handle={view} onClose={() => setView(null)} />}
    </div>
  );
}

type Tab = 'posts' | 'photos' | 'videos' | 'personal' | 'work' | 'earn' | 'followers' | 'following';

/** Social Life · My Profile — real identity, stats, posts, People search & Post & Earn. */
export function SocialProfile() {
  const me = useMyProfile();
  const posts = useMyPosts();
  const [tab, setTab] = useState<Tab>('posts');
  const [editing, setEditing] = useState(false);
  const allPosts = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);

  if (me.isLoading) return <div style={{ padding: 40 }}><Spinner label="Loading your profile…" /></div>;
  if (me.isError || !me.data) {
    return <div style={{ maxWidth: 980, margin: '0 auto', padding: 40 }}><p className="muted">Couldn't load your profile. Reload to try again.</p></div>;
  }
  const p = me.data;
  const joined = new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <VerifiedBadge />}</h1>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>Edit profile</button>
            <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace' }}>@{p.handle}</span> · Joined {joined}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>📍 {p.city}</p>}
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 560 }}>{p.bio}</p>}
          {p.website && <p style={{ margin: '4px 0 0' }}><a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)' }}>{p.website.replace(/^https?:\/\//, '')}</a></p>}
          <div style={{ display: 'flex', gap: 22, margin: '12px 0 0', flexWrap: 'wrap' }}>
            <StatCell n={p.stats.posts} label="posts" />
            <button type="button" onClick={() => setTab('followers')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
              <StatCell n={p.stats.followers} label="followers" />
            </button>
            <button type="button" onClick={() => setTab('following')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
              <StatCell n={p.stats.following} label="following" />
            </button>
            <StatCell n={p.stats.cityPoints} label="city points" />
          </div>
        </div>
      </div>

      <div className="rise d1" style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" className={`pill ${tab === 'posts' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('posts')}>Posts</button>
        <button type="button" className={`pill ${tab === 'photos' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('photos')}>Photos</button>
        <button type="button" className={`pill ${tab === 'videos' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('videos')}>Videos</button>
        <button type="button" className={`pill ${tab === 'personal' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('personal')}>🏖 Personal</button>
        <button type="button" className={`pill ${tab === 'work' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('work')}>💼 Work</button>
        <button type="button" className={`pill ${tab === 'followers' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('followers')}>Followers</button>
        <button type="button" className={`pill ${tab === 'following' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('following')}>Following</button>
        <button type="button" className={`pill ${tab === 'earn' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('earn')}>💰 Post &amp; Earn</button>
      </div>

      {tab === 'posts' && <PostsTab />}
      {tab === 'photos' && <PostsTab filter="photo" />}
      {tab === 'videos' && <PostsTab filter="video" />}
      {tab === 'personal' && <PostsTab category="personal" />}
      {tab === 'work' && <PostsTab category="work" />}
      {tab === 'followers' && <FollowList kind="followers" />}
      {tab === 'following' && (<><FollowList kind="following" /><PeopleTab /></>)}
      {tab === 'earn' && <div className="rise d1" style={{ marginTop: 16 }}><EarnView posts={allPosts} /></div>}

      {editing && <EditProfileModal me={p} onClose={() => setEditing(false)} />}
    </div>
  );
}
