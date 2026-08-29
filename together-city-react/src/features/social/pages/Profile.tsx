import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { Icon } from '@/components/ui/Icon';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Spinner } from '@/components/ui';
import { chatApi } from '@/api';
import { useConnections, useRequestConnection, useRespondConnection } from '@/api/connections.api';
import { ModuleChips } from '@/features/connections/components/ModuleToggles';
import { profileApi } from '@/features/profile/api';
import { useAuthStore } from '@/store/auth.store';
import {
  useMyProfile, useMyPosts, usePeopleSearch, usePublicProfile, usePublicPosts, useUpdateProfile, useReorderMyPosts,
  type MyProfile, type ProfilePost, type PersonResult, type PublicProfile, type Relationship,
} from '../myProfile.api';
import { useFollowers, useFollowing, useFollow, useUnfollow, useBlock, useReport, useSetCover, useSetPostCategory, type FollowPerson, type Post } from '../api';
import { PostCard } from '../PostCard';


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

/** Blue verified check — shown when the account's email is verified. */
function VerifiedBadge() {
  return (
    <span title="Verified member" aria-label="Verified" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--info-ink)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 900, flexShrink: 0 }}><Icon name="accepted" size={12} /></span>
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
    <div className="social-tile">
      {imgSrc ? (
        <img src={imgSrc} alt={p.text ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', background: isVideo ? 'var(--ink)' : undefined }} />
      ) : isVideo && first ? (
        // No server thumbnail — show a STILL FRAME via preload="metadata" seeked
        // to 0.1s (#t=0.1). The browser fetches only metadata + that one frame,
        // not the whole video, and it never plays here (muted, no autoplay).
        <video src={`${first.url}#t=0.1`} preload="metadata" muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: 'var(--media-bg)', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center', fontSize: 13, lineHeight: 1.4, color: 'var(--on-accent)', background: 'linear-gradient(140deg,var(--accent),var(--accent-ink))' }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.feeling ? `${p.feeling} · ` : ''}{p.text || 'Post'}</span>
        </div>
      )}
      {isVideo && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, margin: 'auto', width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}><Icon name="play" size={19} /></span>
      )}
      {p.outdoor && <span style={{ position: 'absolute', top: 6, right: 6, color: 'var(--on-accent)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }}><Icon name="place" size={15} /></span>}
      {/* Work/Personal category badge (when the post has been sorted) */}
      {(p.category === 'personal' || p.category === 'work') && (
        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--on-accent)', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '1px 7px' }}>
          <Icon name={p.category === 'work' ? 'job' : 'personal'} size={12} />{p.category === 'work' ? 'Work' : 'Personal'}
        </span>
      )}
      {/* Every post shows its date */}
      <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 11, fontWeight: 600, color: 'var(--on-accent)', background: 'rgba(0,0,0,.5)', borderRadius: 6, padding: '1px 7px' }}>
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

/**
 * THE READER — a scroll, not a single card in a box.
 *
 * Tapping a tile used to open exactly one post in an overlay with a Close
 * button under it, so seeing the next one meant closing, finding the next
 * tile, and opening again. Instagram opens the same grid as a COLUMN, scrolled
 * to the one you touched, and you keep going from there. That is the whole
 * change: the overlay holds the list now, and the tapped post is where it
 * starts rather than all it contains.
 *
 * VIDEOS PLAY ONE AT A TIME, and that is not decoration — it is the reason a
 * column of them is usable at all. `autoplayVideo` is machinery PostCard
 * already has for the Videos feed: muted autoplay above 60% visibility, pause
 * on the way out, and `src` withheld until the card is nearly on screen so
 * opening the reader does not open a connection per video. Without it, five
 * videos in a column is five sound tracks and five sockets.
 *
 * The scroll is INSTANT, not smooth. You touched a specific tile; arriving
 * anywhere else first and gliding to it is a journey nobody asked for.
 */
function PostReader({
  posts, startId, onClose, manage, onOpenAuthor,
}: {
  posts: { post: Post; category?: string | null }[];
  startId: string;
  onClose: () => void;
  manage?: boolean;
  onOpenAuthor?: (handle: string) => void;
}) {
  const setCover = useSetCover();
  const setCategory = useSetPostCategory();
  const scroller = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startRef.current?.scrollIntoView({ block: 'start' });
  }, [startId]);

  // Escape closes, because a full-height scroller with a button at the bottom
  // has no reachable Close once you are three posts down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ONE SCROLL CONTEXT. The page behind the reader is locked while it is
  // open, so a flick at the reader's end cannot hand the gesture to the wall
  // underneath — two scrollable layers under one thumb is the classic "the
  // feed fights the swipe" bug. Same pattern the reels portal uses.
  // The shared counted lock — see useScrollLock. This reader can sit OVER the
  // reels player, and the two ad-hoc body locks used to clobber each other.
  useScrollLock(true);

  const chip = (postId: string, cur: string, key: '' | 'personal' | 'work', label: string) => (
    <button key={key || 'none'} type="button" disabled={setCategory.isPending}
      onClick={() => setCategory.mutate({ postId, category: key === '' ? null : key })}
      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--r-full)',
        border: `1.5px solid ${cur === key ? 'var(--accent)' : 'var(--line)'}`,
        background: cur === key ? 'var(--accent)' : 'var(--card)', color: cur === key ? 'var(--on-accent)' : 'var(--ink)' }}>
      {label}
    </button>
  );

  return (
    /* `is-reader`: on touch screens the frost drops its backdrop blur (see
       relief.css) — a full-viewport blur repainted under a scrolling column is
       the single most expensive thing an iPhone can be asked to composite.
       `overflow: hidden` because the COLUMN is the one scroller here; the
       overlay's own `overflow: auto` was a second scroll surface fighting it. */
    <div className="sheet-ov is-top is-reader" onClick={onClose} style={{ overflow: 'hidden' }}>
      {/* Close is FIXED to the overlay, not placed after the list. Three posts
          down, a button at the end of the column is not a way out. */}
      <button type="button" onClick={onClose} className="btn btn-line btn-sm"
        style={{ position: 'fixed', top: 14, right: 16, zIndex: 2 }}>Close</button>
      <div ref={scroller} onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(600px,96vw)', maxHeight: '100dvh', overflowY: 'auto', padding: '14px 0 40px', scrollbarWidth: 'thin',
          overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {posts.map(({ post, category }) => (
          <div key={post.id} ref={post.id === startId ? startRef : undefined} style={{ scrollMarginTop: 14, marginBottom: 18 }}>
            <PostCard post={post} autoplayVideo
              manage={manage}
              onOpenAuthor={onOpenAuthor}
              onSetCover={manage ? (t) => setCover.mutate({ postId: post.id, time: t }) : undefined}
              coverBusy={manage ? setCover.isPending : undefined} />
            {manage && (
              <div className="card" style={{ margin: '8px 0 0', padding: '12px 14px', border: '1.5px solid var(--accent)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                  <Icon name="sort" size={14} /> Sort this post {setCategory.isPending && <span className="muted" style={{ fontWeight: 500 }}>· Saving…</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {chip(post.id, category ?? '', '', 'None')}
                  {chip(post.id, category ?? '', 'personal', 'Personal')}
                  {chip(post.id, category ?? '', 'work', 'Work')}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The citizen's own tile wall. EXPORTED because Personal's Album draws the
 *  same pictures — one grid, not two that drift apart the first time a
 *  video poster or the lightbox changes. */
export function PostsTab({ filter = 'all', category = 'all' }: { filter?: 'all' | 'photo' | 'video'; category?: 'all' | 'work' | 'personal' }) {
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

  // FLIP for the reorder. A tile that changes grid cell must TRAVEL to its new
  // cell — a full cell width in one frame, mid-drag, is the jump this prevents.
  const gridRef = useRef<HTMLDivElement>(null);
  const firstRects = useRef<Map<string, DOMRect>>(new Map());

  /** Read positions BEFORE the state change. Called first inside `move`. */
  const captureFirst = () => {
    firstRects.current.clear();
    gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      firstRects.current.set(el.dataset.tile!, el.getBoundingClientRect());
    });
  };

  // After React commits the new order, invert and play. useLayoutEffect, not
  // useEffect: useEffect runs after paint and the user sees the jump.
  useLayoutEffect(() => {
    if (!firstRects.current.size) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const moved: HTMLElement[] = [];
    gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      const first = firstRects.current.get(el.dataset.tile!);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!dx && !dy) return;
      if (reduce) return;               // no movement under reduced motion
      // A second reorder mid-flight retargets: `first` was measured from where
      // the tile visually IS (getBoundingClientRect sees the live transform),
      // so this inversion is relative to the current position, not the original.
      el.ontransitionend = null;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(el);
    });
    firstRects.current.clear();
    if (!moved.length) return;
    // One forced flush for the whole grid, so the browser records the inverted
    // position as the transition's start value. Without it the invert and the
    // play can land in the same style recalc and nothing animates at all.
    gridRef.current?.getBoundingClientRect();
    requestAnimationFrame(() => {
      moved.forEach((el) => {
        // Hand the element back when it arrives: an inline transform left on the
        // tile would shadow `.social-tile:hover { transform: translateY(-3px) }`,
        // and an inline transition would outlive the reorder.
        el.ontransitionend = (e) => {
          if (e.propertyName !== 'transform') return;
          el.ontransitionend = null;
          el.style.transition = '';
          el.style.transform = '';
        };
        el.style.transition = 'transform var(--dur-base) var(--ease-out)';
        el.style.transform = '';
      });
    });
  }, [arranged]);

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
  /**
   * A FAILED READ IS NOT AN EMPTY ACCOUNT (30 Aug audit, blocker 5).
   *
   * This screen had no `isError` branch, so a dropped connection told the
   * citizen their entire history was gone and offered them a cheerful button
   * to write their first post. Six other screens in this hub did the same
   * thing; `Notifications.tsx` and `Blocked.tsx` did not, and are the shape
   * copied here. An empty state is a CLAIM about the server's data, and it may
   * only be made once the read has proved it.
   */
  if (posts.isError) {
    return (
      <div className="blk rise d1 sl-fail">
        <p className="sl-fail-t">Couldn’t load your posts.</p>
        <p className="sl-fail-h">They’re still there — this is a connection problem.</p>
        <button type="button" className="btn btn-line btn-sm" onClick={() => void posts.refetch()}>Try again</button>
      </div>
    );
  }

  const count = items.length;
  if (!count) {
    return (
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 16 }}>
        <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name="grid" size={30} /></span>
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
    captureFirst();   // must be first: reading after the state change measures the wrong frame
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
              {canArrange && view.length > 1 && <Button variant="line" size="sm" onClick={startArranging}><Icon name="reorder" size={14} /> Rearrange</Button>}
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
          <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name={filter === 'video' ? 'video' : 'camera'} size={30} /></span>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>No {noun}s yet.</p>
        </div>
      )}

      <div className="rise d1 social-grid" ref={gridRef}>
        {grid.map((p, i) => (
          arranging ? (
            <div
              key={p.id}
              data-tile={p.id}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null; setDragOver(null); }}
              onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
              style={{
                /* pan-y, not none: HTML5 drag-and-drop never fires from a
                   touch anyway, and 'none' also blocked SCROLLING the grid —
                   while the copy above says "scroll to load all posts before
                   rearranging". Reordering by touch still needs a pointer-
                   event implementation; until then the thumb keeps the page. */
                position: 'relative', cursor: 'grab', touchAction: 'pan-y',
                outline: dragOver === i ? '2px solid var(--accent)' : 'none', outlineOffset: 2, borderRadius: 8,
                opacity: dragFrom.current === i ? 0.5 : 1,
              }}
            >
              <PostTile p={p} />
              <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 14, color: 'var(--on-accent)', background: 'rgba(0,0,0,.5)', borderRadius: 6, padding: '0 6px', lineHeight: 1.6 }}>⠿</span>
            </div>
          ) : (
            <button key={p.id} data-tile={p.id} type="button" onClick={() => setOpenId(p.id)}
              style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
              <PostTile p={p} />
            </button>
          )
        ))}
      </div>
      {!arranging && <div ref={sentinel} style={{ height: 1 }} />}
      {!arranging && posts.isFetchingNextPage && <div style={{ padding: 16 }}><Spinner /></div>}
      {(() => {
        // Driven by live items: if a post is edited or deleted the reader
        // reflects it, and it closes when the post you opened is gone.
        // THE SAME SET THE GRID IS SHOWING, not every post. On the Videos tab
        // you tapped a video; scrolling on from it into photos would be the
        // reader disagreeing with the grid you opened it from.
        if (!openId || !view.some((x) => x.id === openId)) return null;
        return (
          <PostReader
            posts={view.map((x) => ({ post: profilePostToPost(x, me.data), category: x.category }))}
            startId={openId}
            manage
            onClose={() => setOpenId(null)}
          />
        );
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

  if (rel === 'accepted') return <Button variant="accent" size="sm" disabled={busy} onClick={() => void message()}>{busy ? '…' : 'Message'}</Button>;
  if (rel === 'pending_out') return <Button variant="line" size="sm" disabled>Requested</Button>;
  if (rel === 'pending_in') {
    // Same rule as everywhere else: this button grants hubs somebody else
    // picked, so it does not stand alone. The row is already in the connections
    // cache — the accept handler looks it up — so the hubs cost nothing to show.
    const row = (connections.data ?? []).find((c) => c.user.id === id && c.status === 'pending');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={() => void accept()}>Accept</Button>
        <ModuleChips modules={row?.modules ?? []} caption="Hubs they want to open:" />
        <span className="muted" style={{ fontSize: 11, textAlign: 'right', maxWidth: 240, lineHeight: 1.5 }}>
          They chose these. You can change them any time afterwards.
        </span>
      </div>
    );
  }
  if (rel === 'blocked') return <Button variant="line" size="sm" disabled>Unavailable</Button>;
  return <Button variant="accent" size="sm" disabled={requestConn.isPending} onClick={() => void connect()}>Connect</Button>;
}

/** Block / Report safety actions for a person, shown in their profile modal. */
function SafetyActions({ id, handle, onBlocked }: { id: string; handle: string; onBlocked: () => void }) {
  const block = useBlock();
  const report = useReport();
  const [reported, setReported] = useState(false);
  /**
   * A SAFETY ACTION THAT FAILS SILENTLY IS THE WORST FAILURE HERE (30 Aug audit).
   *
   * Both of these were `mutate(..., { onSuccess })` with no `onError`. The
   * modal simply stayed open on a failure — so a citizen blocked a harasser,
   * the request never landed, nothing told them, and they carried on believing
   * they were protected. Every other silent mutation in this hub costs somebody
   * a retry; this one costs them the thing they came here for.
   */
  const [failed, setFailed] = useState<'block' | 'report' | null>(null);

  const doBlock = () => {
    if (!window.confirm(`Block @${handle}? They won't be able to see your posts or interact with you, and you won't see theirs.`)) return;
    setFailed(null);
    block.mutate({ handle }, { onSuccess: onBlocked, onError: () => setFailed('block') });
  };
  const doReport = () => {
    const reason = window.prompt(`Report @${handle}? Optionally tell us what's wrong (spam, harassment, etc.):`, '');
    if (reason === null) return; // cancelled
    setFailed(null);
    report.mutate({ targetType: 'user', targetId: id, reason: reason || undefined },
      { onSuccess: () => setReported(true), onError: () => setFailed('report') });
  };

  return (
    <div className="sl-safety">
      <div className="sl-safety-row">
        <button type="button" onClick={doBlock} disabled={block.isPending}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--danger-ink)', padding: 0 }}>
          {block.isPending ? 'Blocking…' : <><Icon name="block" size={14} /> Block</>}
        </button>
        <button type="button" onClick={doReport} disabled={report.isPending || reported}
          style={{ background: 'none', border: 'none', cursor: reported ? 'default' : 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--muted)', padding: 0 }}>
          {reported ? <><Icon name="accepted" size={14} /> Reported</> : <><Icon name="flag" size={14} /> Report</>}
        </button>
      </div>
      {failed && (
        <p role="alert" className="sl-fail-alert">
          {failed === 'block'
            ? 'That block didn’t go through — you are NOT blocking them yet. Try again in a moment.'
            : 'That report didn’t go through. Try again in a moment.'}
        </p>
      )}
    </div>
  );
}

export function PublicProfileModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const q = usePublicProfile(handle);
  const p = q.data as PublicProfile | undefined;
  return (
    <div onClick={onClose} className="sheet-ov is-centred">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: 'min(460px,94vw)', maxHeight: '86vh', overflow: 'auto' }}>
        {q.isLoading && <Spinner label="Loading profile…" />}
        {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load that profile.</p>}
        {p && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar src={p.profileImage} name={p.name} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{p.name}</h3>{p.verified && <VerifiedBadge />}
                </div>
                <div className="muted" style={{ fontSize: 12.5, fontFamily: 'monospace' }}>@{p.handle}</div>
                {p.city && <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="place" size={13} />{p.city}</div>}
              </div>
            </div>
            {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' }}>{p.bio}</p>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{p.website.replace(/^https?:\/\//, '')}</a>}
            <div style={{ display: 'flex', gap: 22, margin: '14px 0' }}>
              <StatCell n={p.stats.posts} label="posts" />
              <StatCell n={p.stats.cityPoints} label="city points" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* The peek has to keep the door it replaced. FollowList used to
                  navigate straight to /social/u/<handle>; opening this instead
                  without a way through would remove the only route from a
                  followers list to somebody's posts. */}
              <Link to={`/social/u/${encodeURIComponent(p.handle)}`} onClick={onClose}
                style={{ marginRight: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
                View full profile <Icon name="next" size={14} />
              </Link>
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

/** Follow / Following toggle for another citizen's profile. */
function FollowButton({ userId, handle, iFollow }: { userId: string; handle: string; iFollow: boolean }) {
  const qc = useQueryClient();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const [following, setFollowing] = useState(iFollow);
  useEffect(() => setFollowing(iFollow), [iFollow]);
  const busy = follow.isPending || unfollow.isPending;
  const bump = () => void qc.invalidateQueries({ queryKey: ['profile', 'user', handle.toLowerCase()] });
  const toggle = () => {
    if (busy) return;
    if (following) { setFollowing(false); unfollow.mutate(userId, { onSuccess: bump, onError: () => setFollowing(true) }); }
    else { setFollowing(true); follow.mutate({ handle }, { onSuccess: bump, onError: () => setFollowing(false) }); }
  };
  return (
    <Button variant={following ? 'line' : 'accent'} size="sm" onClick={toggle} disabled={busy}>
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}

/** Read-only post viewer for a public profile (no edit/delete/sort). */
/* ReadOnlyLightbox is gone — the reader below serves both profiles. */

/** Read-only grid of another citizen's posts (Posts / Photos / Videos). */
function PublicPostsTab({ handle, filter, onOpenAuthor }: { handle: string; filter: 'all' | 'photo' | 'video'; onOpenAuthor: (handle: string) => void }) {
  const posts = usePublicPosts(handle);
  const [openId, setOpenId] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);
  const matchesFilter = (p: ProfilePost) => {
    const hasVideo = p.media.some((m) => m.kind === 'video');
    const hasImage = p.media.some((m) => m.kind === 'image');
    if (filter === 'video') return hasVideo;
    if (filter === 'photo') return hasImage && !hasVideo;
    return true;
  };
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !posts.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !posts.isFetchingNextPage) void posts.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts.hasNextPage, posts.isFetchingNextPage, posts]);

  if (posts.isLoading) return <Spinner label="Loading posts…" />;
  if (posts.isError) {
    return (
      <div className="blk rise d1 sl-fail">
        <p className="sl-fail-t">Couldn’t load these posts.</p>
        <p className="sl-fail-h">This is a connection problem, not an empty profile.</p>
        <button type="button" className="btn btn-line btn-sm" onClick={() => void posts.refetch()}>Try again</button>
      </div>
    );
  }
  const view = items.filter(matchesFilter);
  const noun = filter === 'photo' ? 'photo' : filter === 'video' ? 'video' : 'post';
  if (view.length === 0) {
    return (
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '44px 24px', marginTop: 16 }}>
        <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name={filter === 'video' ? 'video' : filter === 'photo' ? 'camera' : 'grid'} size={30} /></span>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>No {noun}s to show.</p>
      </div>
    );
  }
  return (
    <>
      <div className="rise d1 social-grid" style={{ marginTop: 16 }}>
        {view.map((p) => (
          <button key={p.id} type="button" onClick={() => setOpenId(p.id)}
            style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
            <PostTile p={p} />
          </button>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} />
      {posts.isFetchingNextPage && <div style={{ padding: 16 }}><Spinner /></div>}
      {(() => {
        const op = openId ? view.find((x) => x.id === openId) : null;
        if (!op) return null;
        return (
          <PostReader
            posts={view.map((x) => ({ post: profilePostToPost(x) }))}
            startId={op.id}
            onOpenAuthor={onOpenAuthor}
            onClose={() => setOpenId(null)}
          />
        );
      })()}
    </>
  );
}

/** Full read-only profile page for another citizen (route /social/u/:handle):
 *  header, stats, Follow / Connect / Message + Block / Report, and their posts. */
export function PublicProfilePage() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const q = usePublicProfile(handle ?? null);
  const p = q.data as PublicProfile | undefined;
  const [tab, setTab] = useState<'posts' | 'photos' | 'videos'>('posts');
  const openAuthor = (h: string) => navigate(`/social/u/${encodeURIComponent(h)}`);

  // If you land on your own handle, send you to your editable profile.
  useEffect(() => { if (p?.isMe) navigate('/social/profile', { replace: true }); }, [p?.isMe, navigate]);

  if (q.isLoading) return <div><Spinner label="Loading profile…" /></div>;
  if (q.isError || !p) {
    return (
      <div>
        <button type="button" className="btn btn-line btn-sm" onClick={() => navigate(-1)}><Icon name="back" size={15} /> Back</button>
        <p className="muted" style={{ marginTop: 16 }}>Couldn't load that profile.</p>
      </div>
    );
  }
  const joined = new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <button type="button" className="btn btn-line btn-sm" style={{ marginBottom: 18 }} onClick={() => navigate(-1)}><Icon name="back" size={15} /> Back</button>

      <div className="card rise" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <VerifiedBadge />}</h1>
            <FollowButton userId={p.id} handle={p.handle} iFollow={p.iFollow} />
            <ConnectButton id={p.id} handle={p.handle} relationship={p.relationship} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace' }}>@{p.handle}</span> · Joined {joined}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="place" size={14} />{p.city}</p>}
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 560 }}>{p.bio}</p>}
          {p.website && <p style={{ margin: '4px 0 0' }}><a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{p.website.replace(/^https?:\/\//, '')}</a></p>}
          <div style={{ display: 'flex', gap: 22, margin: '12px 0 0', flexWrap: 'wrap' }}>
            <StatCell n={p.stats.posts} label="posts" />
            <StatCell n={p.stats.followers} label="followers" />
            <StatCell n={p.stats.following} label="following" />
            <StatCell n={p.stats.cityPoints} label="city points" />
          </div>
          <div style={{ marginTop: 12 }}>
            <SafetyActions id={p.id} handle={p.handle} onBlocked={() => navigate('/social/feed')} />
          </div>
        </div>
      </div>

      <div className="rise d1" style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" className={`pill ${tab === 'posts' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('posts')}>Posts</button>
        <button type="button" className={`pill ${tab === 'photos' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('photos')}>Photos</button>
        <button type="button" className={`pill ${tab === 'videos' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('videos')}>Videos</button>
      </div>

      <PublicPostsTab handle={p.handle} filter={tab === 'photos' ? 'photo' : tab === 'videos' ? 'video' : 'all'} onOpenAuthor={openAuthor} />
    </div>
  );
}

function PeopleTab() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 220); return () => clearTimeout(t); }, [q]);
  const search = usePeopleSearch(dq);
  const results = (search.data ?? []) as PersonResult[];

  return (
    <div className="rise d1" style={{ marginTop: 16 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 4px' }}>Find people</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Search by name, @handle or Together City ID, then connect.</p>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
          <span className="muted" style={{ display: 'inline-flex' }}><Icon name="search" size={15} /></span>
          <input value={q} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQ(e.target.value)} placeholder="Search name or @handle"
            style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {dq.trim().length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {search.isLoading && <Spinner />}
            {/* Stating that somebody is not a member of the city, on the
                strength of a request that failed, is a claim this screen was
                making and could not support. */}
            {search.isError && <p className="sl-note-p">Couldn’t search just now — try again in a moment.</p>}
            {!search.isLoading && !search.isError && results.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No members match “{dq}”.</p>}
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
                <Button variant="line" size="sm" onClick={() => navigate(`/social/u/${encodeURIComponent(r.handle)}`)}>View</Button>
                <ConnectButton id={r.id} handle={r.handle} relationship={r.relationship} />
              </div>
            ))}
          </div>
        )}
      </div>
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

  const field: React.CSSProperties = { width: '100%', padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 5px' };

  return (
    <div onClick={onClose} className="sheet-ov is-centred">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: 'min(500px,94vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="blk-head"><h3>Edit profile</h3></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <Avatar src={photo} name={name} size={64} />
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="line" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Change photo</Button>
            <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Square JPG/PNG, saved instantly.</p>
          </div>
        </div>

        <label style={{ display: 'block' }}>
          <span style={label}>Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={field} maxLength={80} />
        </label>

        <label style={label}>Handle</label>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', padding: '0 10px' }}>
          <span className="muted">@</span>
          <input aria-label="Handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '11px 6px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} maxLength={30} />
        </div>

        <label style={label}>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} style={{ ...field, resize: 'vertical' }} placeholder="A line about you" />

        <label style={label}>City</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} style={field} maxLength={80} placeholder="e.g. Mumbai" />

        <label style={label}>Website</label>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} style={field} placeholder="https://…" />

        {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="line" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="accent" size="sm" onClick={() => void save()} disabled={busy || !name.trim() || handle.length < 3}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Post & Earn, told the truth.
 *
 * This tab used to quote rates: "up to ₹100 each, ₹1,500/day", "once reviewed
 * & approved, each eligible video (3+ minutes) can earn up to ₹100". Every
 * video a citizen had posted was listed underneath with the status "In review".
 *
 * There is no earnings programme. No payout model in the schema, no route, no
 * review queue, nothing that could ever pay anybody or look at a video. The
 * balances all read ₹0, which is what made it convincing — a real account that
 * simply had not filled up yet.
 *
 * Of everything found in this sweep, this is the one that asked people for
 * work. Record three minutes about your life, and the money is coming. It was
 * not coming. The rates and the review status are gone; what a citizen sees now
 * is that the programme has not opened, and that their videos are posts rather
 * than submissions.
 */
function EarnView({ posts }: { posts: ProfilePost[] }) {
  const videos = posts.filter((p) => p.media.some((m) => m.kind === 'video'));
  const TOPICS = [
    'Your life & personal journey', 'Your daily routine', 'Food reviews & cooking', 'Restaurants & cafés',
    'Health & fitness', 'Beauty & skincare', 'Travel experiences', 'Movies & entertainment',
    'Career & work life', 'Personal growth', 'Family & friendships', 'Hobbies & passions',
  ];
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Post &amp; Earn</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1.2, marginTop: 6 }}>Not open yet</div>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 8, maxWidth: '54ch' }}>
          No way to earn from your videos today — no rate, no review, no payout. When that
          changes, you’ll hear it here first.
        </div>
      </div>

      <div className="card">
        <div className="blk-head"><h3>What we are hoping to build</h3></div>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          A way for the people who make this city worth living in to be paid for it — authentic
          videos about your life and your corner of the city, and a share of what they bring in.
          A real intention — not a promise with a date on it.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>The kinds of stories we mean</h3></div>
        <div style={{ marginTop: 10 }}>
          {TOPICS.map((t) => (
            <span key={t} className="tag" style={{ margin: '0 6px 6px 0' }}>{t}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>Your videos</h3><span className="muted" style={{ fontSize: 12 }}>{videos.length}</span></div>
        {videos.length === 0
          ? <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>You haven’t posted a video yet.</p>
          : videos.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text || v.feeling || 'Video post'}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>Posted</span>
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
    else follow.mutate({ handle: person.handle });
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
  // A peek, not a departure. Tapping a row in a list you are browsing should
  // not cost you your place in it — the modal carries Follow, Connect and the
  // safety actions, and links through to the full profile for anything more.
  const [peek, setPeek] = useState<string | null>(null);
  const followers = useFollowers();
  const following = useFollowing();
  const q = kind === 'followers' ? followers : following;
  const people = q.data ?? [];
  if (q.isLoading) return <div style={{ marginTop: 16 }}><Spinner label={`Loading ${kind}…`} /></div>;
  // "No followers yet" to somebody with four hundred of them is the worst
  // sentence in this file. It needs the read to have succeeded first.
  if (q.isError) {
    return (
      <p className="sl-fail-line">
        Couldn’t load {kind} — this is a connection problem.{' '}
        <button type="button" className="sl-fail-again" onClick={() => void q.refetch()}>Try again</button>
      </p>
    );
  }
  if (!people.length) {
    return (
      <p className="muted" style={{ fontSize: 13.5, marginTop: 20 }}>
        {kind === 'followers' ? 'No followers yet.' : "You're not following anyone yet. Find people to follow below."}
      </p>
    );
  }
  return (
    <div className="rise d1" style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 560 }}>
      {people.map((person) => <FollowRow key={person.id} person={person} onView={() => setPeek(person.handle)} />)}
      {peek && <PublicProfileModal handle={peek} onClose={() => setPeek(null)} />}
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
    return <div><p className="muted">Couldn't load your profile. Reload to try again.</p></div>;
  }
  const p = me.data;
  const joined = new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="card rise" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <VerifiedBadge />}</h1>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} /> Edit profile
            </button>
            <Link className="btn btn-accent btn-sm" to="/social/create"><Icon name="plus" size={15} /> New post</Link>
          </div>
          {/* Account tabs sit right beside Edit profile (moved out of the content
              tab bar below). */}
          <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className={`chip ${tab === 'followers' ? 'on' : ''}`} onClick={() => setTab('followers')} aria-pressed={tab === 'followers'}>
              <Icon name="people" size={15} />Followers
            </button>
            <button type="button" className={`chip ${tab === 'following' ? 'on' : ''}`} onClick={() => setTab('following')} aria-pressed={tab === 'following'}>
              <Icon name="follow" size={15} />Following
            </button>
            <button type="button" className={`chip ${tab === 'earn' ? 'on' : ''}`} onClick={() => setTab('earn')} aria-pressed={tab === 'earn'}>
              <Icon name="wallet" size={15} />Post &amp; Earn
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace' }}>@{p.handle}</span> · Joined {joined}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="place" size={14} />{p.city}</p>}
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 560 }}>{p.bio}</p>}
          {p.website && <p style={{ margin: '4px 0 0' }}><a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{p.website.replace(/^https?:\/\//, '')}</a></p>}
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

      <div className="sl-tabs rise d1" role="tablist" aria-label="Your posts">
        <button type="button" role="tab" className={`sl-tab${tab === 'posts' ? ' on' : ''}`} onClick={() => setTab('posts')} aria-selected={tab === 'posts'}>
          <Icon name="grid" size={15} />Posts
        </button>
        <button type="button" role="tab" className={`sl-tab${tab === 'photos' ? ' on' : ''}`} onClick={() => setTab('photos')} aria-selected={tab === 'photos'}>
          <Icon name="camera" size={15} />Photos
        </button>
        <button type="button" role="tab" className={`sl-tab${tab === 'videos' ? ' on' : ''}`} onClick={() => setTab('videos')} aria-selected={tab === 'videos'}>
          <Icon name="video" size={15} />Videos
        </button>
        <button type="button" role="tab" className={`sl-tab${tab === 'personal' ? ' on' : ''}`} onClick={() => setTab('personal')} aria-selected={tab === 'personal'}>
          <Icon name="personal" size={15} />Personal
        </button>
        <button type="button" role="tab" className={`sl-tab${tab === 'work' ? ' on' : ''}`} onClick={() => setTab('work')} aria-selected={tab === 'work'}>
          <Icon name="job" size={15} />Work
        </button>
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
