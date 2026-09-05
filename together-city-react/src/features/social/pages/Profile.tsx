import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useBackToClose } from '@/hooks/useBackToClose';
import { useDialog } from '@/hooks/useDialog';
import { Icon } from '@/components/ui/Icon';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { onStaleMedia } from '@/lib/remint';
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
import { useFollowers, useFollowing, useFollow, useUnfollow, useBlock, useSetCover, useSetPostCategory, type FollowPerson, type Post } from '../api';
import { PostCard } from '../PostCard';
import { ReportMenu } from '../report';
import { Confirm } from '../Confirm';
import { Tablist } from '../Tablist';


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

/**
 * IT MEANS THE EMAIL WAS CONFIRMED, AND NOW IT SAYS SO (30 Aug audit).
 *
 * `verified` on the profile API is `User.emailVerified` and nothing else. It
 * was drawn as a filled blue disc with a white check beside the name and
 * titled "Verified member" — which is, everywhere on the internet, the mark
 * for a checked identity. Nobody at Together City checks an identity. So one
 * confirmation click bought a stranger the badge that says "this really is
 * who it says", which is the badge a scam wants most.
 *
 * Same fact, told properly: a hairline check in the quiet ink, at the weight
 * of a footnote rather than a credential, named for the thing it knows.
 */
function EmailConfirmedMark() {
  return (
    <span title="Email address confirmed. Together City does not verify identity."
      aria-label="Email address confirmed"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', flexShrink: 0 }}><Icon name="accepted" size={11} /></span>
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
  // Printed on every tile of the grid, so an unparseable date was "Invalid
  // Date" repeated down the page.
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** One post in the profile grid. Videos show only a lightweight POSTER (their
 *  thumbnail) or a placeholder with a play button — the actual video is never
 *  loaded here, only when the post is opened in the lightbox. This keeps the
 *  profile from downloading every video on load. */
function PostTile({ p }: { p: ProfilePost }) {
  const qc = useQueryClient();
  const first = p.media[0];
  const isVideo = first?.kind === 'video';
  // For videos, only a thumbnail image is ever loaded here (never the video file).
  const imgSrc = isVideo ? (first?.thumbUrl ?? null) : (first ? (first.thumbUrl || first.url) : null);
  return (
    <div className="social-tile">
      {imgSrc ? (
        <img src={imgSrc} alt={p.text ?? ''} loading="lazy" onError={() => onStaleMedia(qc, ['profile'])} style={{ width: '100%', height: '100%', objectFit: 'cover', background: isVideo ? 'var(--ink)' : undefined }} />
      ) : isVideo && first ? (
        // No server thumbnail — show a STILL FRAME via preload="metadata" seeked
        // to 0.1s (#t=0.1). The browser fetches only metadata + that one frame,
        // not the whole video, and it never plays here (muted, no autoplay).
        <video src={`${first.url}#t=0.1`} preload="metadata" muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: 'var(--media-bg)', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-12)', textAlign: 'center', fontSize: 13, lineHeight: 1.4, color: 'var(--on-accent)', background: 'linear-gradient(140deg,var(--accent),var(--accent-ink))' }}>
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
    savedByMe: p.savedByMe ?? false,
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
/**
 * ── THE READER OPENS WHERE YOU TOUCHED, AND KEEPS GOING (owner, 4 Sep) ──────
 *
 * "when clicked it should play at the same place and then make a scroll."
 *
 *   1 · THE COLUMN ARRIVED SOMEWHERE ELSE. A tap on the right of a nine-tile
 *       wall opened a column centred at full size with nothing connecting the
 *       tile to it. The column now starts AT the tile's rectangle
 *       (`originRect`) and travels to its resting place — one FLIP, measured
 *       after the instant scroll and released on the next paint. A citizen
 *       who asked for no motion gets the column at rest, at once.
 *   2 · THE VIDEO ENDED AND THE SCREEN SAT STILL. Autoplay-in-view plays what
 *       is on screen; nothing moved the screen. The end of a clip now scrolls
 *       to the next post that HAS a video — the next VIDEO, not the next
 *       post — and never wraps.
 */
function PostReader({
  posts, startId, onClose, manage, onOpenAuthor, originRect,
}: {
  posts: { post: Post; category?: string | null }[];
  startId: string;
  onClose: () => void;
  manage?: boolean;
  onOpenAuthor?: (handle: string) => void;
  /** Where the tile that opened this sat, so the column can start there. */
  originRect?: DOMRect | null;
}) {
  const setCover = useSetCover();
  const setCategory = useSetPostCategory();
  const scroller = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement | null>(null);

  // useLayoutEffect, not useEffect: an effect would show the column at rest
  // for one frame and then snap it back to the tile to begin. The scroll is
  // instant so the FLIP measures the resting position, not a mid-scroll one.
  useLayoutEffect(() => {
    startRef.current?.scrollIntoView({ block: 'start' });
    const col = column.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!col || !originRect || reduce) return;
    const to = col.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const dx = originRect.left - to.left;
    const dy = originRect.top - to.top;
    const sx = originRect.width / to.width;
    const sy = originRect.height / to.height;
    col.style.transition = 'none';
    col.style.transformOrigin = 'top left';
    col.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    // Read back between the two writes, or the browser coalesces them and
    // animates nothing.
    void col.offsetWidth;
    col.style.transition = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
    col.style.transform = 'none';
    const done = () => { col.style.transition = ''; col.style.transformOrigin = ''; };
    col.addEventListener('transitionend', done, { once: true });
    return () => col.removeEventListener('transitionend', done);
  }, [startId, originRect]);

  // The next post that HAS a video, in column order. Photos between two
  // clips are skipped: "play my videos" means the videos.
  const videoIds = posts.filter(({ post }) => post.media.some((m) => m.kind === 'video')).map(({ post }) => post.id);
  const advance = (fromId: string) => {
    const i = videoIds.indexOf(fromId);
    if (i < 0 || i + 1 >= videoIds.length) return;
    const next = scroller.current?.querySelector<HTMLElement>(`[data-reader-post="${videoIds[i + 1]}"]`);
    next?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // Escape closes, because a full-height scroller with a button at the bottom
  // has no reachable Close once you are three posts down. The shared hook does
  // that AND the three things the hand-rolled listener never did: move focus
  // in, keep Tab inside the reader, and hand focus back to the thumbnail that
  // opened it. The ref goes on the OVERLAY, not the column, because the Close
  // button is fixed to the overlay — trapping to the column would put the one
  // way out on the wrong side of the trap.
  const reader = useDialog(onClose);

  // ONE SCROLL CONTEXT. The page behind the reader is locked while it is
  // open, so a flick at the reader's end cannot hand the gesture to the wall
  // underneath — two scrollable layers under one thumb is the classic "the
  // feed fights the swipe" bug. Same pattern the reels portal uses.
  // The shared counted lock — see useScrollLock. This reader can sit OVER the
  // reels player, and the two ad-hoc body locks used to clobber each other.
  useScrollLock(true);
  // Escape already closed this; a phone has no Escape key, and Back was
  // leaving the profile instead of the reader (30 Aug audit).
  useBackToClose(true, onClose);

  /**
   * TWO WRITES IN THIS READER SAID "SAVING…" AND THEN SAID NOTHING (30 Aug).
   *
   * Sorting a post and pinning a cover frame both showed a pending label and
   * then simply stopped. The chip stayed where it was, the cover stayed what
   * it was, and neither told the citizen why — while the card's own copy
   * promises of the cover that "it's pinned for good", which a silent failure
   * turns into a lie rather than an omission.
   */
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const chip = (postId: string, cur: string, key: '' | 'personal' | 'work', label: string) => (
    <button key={key || 'none'} type="button" disabled={setCategory.isPending}
      onClick={() => {
        setSaveErr(null);
        setCategory.mutate({ postId, category: key === '' ? null : key },
          { onError: () => setSaveErr('That didn’t save — the post is still sorted the way it was. Try again.') });
      }}
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
    <div ref={reader} role="dialog" aria-modal="true" aria-label="Posts" tabIndex={-1}
      className="sheet-ov is-top is-reader" onClick={onClose} style={{ overflow: 'hidden' }}>
      {/* Close is FIXED to the overlay, not placed after the list. Three posts
          down, a button at the end of the column is not a way out. */}
      <button type="button" onClick={onClose} className="btn btn-line btn-sm"
        style={{ position: 'fixed', top: 14, right: 16, zIndex: 2 }}>Close</button>
      <div ref={(el) => { scroller.current = el; column.current = el; }} onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(600px,96vw)', maxHeight: '100dvh', overflowY: 'auto', padding: '14px 0 40px', scrollbarWidth: 'thin',
          overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {posts.map(({ post, category }) => (
          <div key={post.id} data-reader-post={post.id} ref={post.id === startId ? startRef : undefined} style={{ scrollMarginTop: 14, marginBottom: 'var(--space-18)' }}>
            <PostCard post={post} autoplayVideo
              onVideoEnded={() => advance(post.id)}
              manage={manage}
              onOpenAuthor={onOpenAuthor}
              onSetCover={manage ? (t) => {
                setSaveErr(null);
                setCover.mutate({ postId: post.id, time: t }, {
                  /* The server now SCREENS this frame, and it answers with two
                     different sentences: "we couldn’t check it just now" is
                     worth retrying and "it didn’t pass" is not. Showing our own
                     generic line instead threw that distinction away at the
                     last step, and told a citizen to try again forever. */
                  onError: (e) => setSaveErr(
                    (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                    || 'That cover wasn’t set — the post still shows the frame it had. Try again.',
                  ),
                });
              } : undefined}
              coverBusy={manage ? setCover.isPending : undefined} />
            {manage && (
              <div className="card" style={{ margin: '8px 0 0', padding: '12px 14px', border: '1.5px solid var(--accent)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 'var(--space-8)' }}>
                  <Icon name="sort" size={14} /> Sort this post {setCategory.isPending && <span className="muted" style={{ fontWeight: 500 }}>· Saving…</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
                  {chip(post.id, category ?? '', '', 'None')}
                  {chip(post.id, category ?? '', 'personal', 'Personal')}
                  {chip(post.id, category ?? '', 'work', 'Work')}
                </div>
                {/* One message for both writes in this card — the chips and the
                    cover button are the only two, and a citizen who just
                    pressed one knows which. */}
                {saveErr && <p role="alert" className="sl-fail-alert">{saveErr}</p>}
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
  const openFrom = useRef<DOMRect | null>(null);
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
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const fetchMore = useCallback(() => { void postsRef.current.fetchNextPage(); }, []);
  const items = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);

  // Drag-to-arrange state. `arranged` holds the working order while editing.
  const [arranging, setArranging] = useState(false);
  /* Beside `arranging`, not beside the handlers that set it — there are two
     early returns between here and there, and a hook after an early return is
     a hook that is called on some renders and not others. The lint rule caught
     it; it would have shown up as the grid losing its state the first time a
     citizen's post list went empty. */
  const [arrangeErr, setArrangeErr] = useState<string | null>(null);
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
      if (entries[0].isIntersecting && !posts.isFetchingNextPage) fetchMore();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts.hasNextPage, posts.isFetchingNextPage, fetchMore, arranging]);

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
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 'var(--space-16)' }}>
        <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name="grid" size={30} /></span>
        <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>No posts yet</h2>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>Share a photo, video or thought with your city.</p>
        <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
      </div>
    );
  }

  const startArranging = () => { setArranged(items.filter(matchesFilter)); setArranging(true); };
  const cancelArranging = () => { setArranging(false); setArranged([]); dragFrom.current = null; setDragOver(null); setArrangeErr(null); };
  const saveArranging = () => {
    // Weave the reordered (filtered) items back into the full post order, leaving
    // posts outside this tab where they are — so rearranging Photos doesn't
    // disturb videos/text posts in the "Posts" tab.
    const newIds = arranged.map((p) => p.id);
    let k = 0;
    const fullOrder = items.map((p) => (matchesFilter(p) ? newIds[k++] : p.id));
    /* THE ONE WHERE SILENCE COSTS THE MOST WORK. A citizen who has just dragged
       thirty tiles into an order presses Save; on a failure the sheet stayed
       open with the arrangement intact and said nothing, which reads as a dead
       button. The arrangement is deliberately NOT discarded — it is minutes of
       their work and the retry needs it — so the message says that too. */
    setArrangeErr(null);
    reorder.mutate(fullOrder, {
      onSuccess: () => { setArranging(false); setArranged([]); },
      onError: () => setArrangeErr('That order wasn’t saved — your arrangement is still here. Try Save again.'),
    });
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
      <div className="blk-head rise d1" style={{ marginTop: 'var(--space-16)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)' }}>
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

      {arrangeErr && <p role="alert" className="sl-fail-alert">{arrangeErr}</p>}

      {arranging && posts.hasNextPage && (
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Arranging the {view.length} loaded posts. Scroll to load all posts before rearranging if you want to move older ones.
        </p>
      )}

      {view.length === 0 && (
        <div className="blk rise d1" style={{ textAlign: 'center', padding: '44px 24px', marginTop: 'var(--space-16)' }}>
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
              <span aria-hidden style={{ position: 'absolute', top: 6, right: 6, color: 'var(--on-accent)', background: 'var(--scrim-deep)', borderRadius: 'var(--r-1)', width: 22, height: 22, lineHeight: 0, display: 'grid', placeItems: 'center' }}><Icon name="reorder" size={14} /></span>
            </div>
          ) : (
            <button key={p.id} data-tile={p.id} type="button" onClick={(e) => { openFrom.current = e.currentTarget.getBoundingClientRect(); setOpenId(p.id); }}
              style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
              <PostTile p={p} />
            </button>
          )
        ))}
      </div>
      {!arranging && <div ref={sentinel} style={{ height: 1 }} />}
      {!arranging && posts.isFetchingNextPage && <div style={{ padding: 'var(--space-16)' }}><Spinner /></div>}
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
            originRect={openFrom.current}
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

  /**
   * "KEEP STATE" WAS HALF A DECISION (30 Aug).
   *
   * Both of these caught the failure and left `rel` alone, which is right —
   * the button does not lie about a connection that was not made. But leaving
   * the state correct and the citizen uninformed are two different things, and
   * only the first was done: Connect went back to saying "Connect", Accept
   * went back to saying "Accept", and neither was distinguishable from a tap
   * that never registered.
   *
   * The server's own sentence is preferred where there is one. A connection
   * request has real reasons to be refused — already connected, blocked, a
   * limit — and each of those is a thing the citizen can act on, where "try
   * again" is not.
   */
  const [connErr, setConnErr] = useState<string | null>(null);
  const said = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

  const connect = async () => {
    setConnErr(null);
    try { await requestConn.mutateAsync(handle); setRel('pending_out'); }
    catch (e) { setConnErr(said(e, 'That request didn’t go through — try again.')); }
  };
  const accept = async () => {
    const row = (connections.data ?? []).find((c) => c.user.id === id && c.status === 'pending');
    if (!row) { navigate('/connections'); return; }
    setConnErr(null);
    try { await respondConn.mutateAsync({ id: row.id, accept: true }); setRel('accepted'); }
    catch (e) { setConnErr(said(e, 'That didn’t go through — you are not connected yet. Try again.')); }
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
        {connErr && <p role="alert" className="sl-fail-alert">{connErr}</p>}
        <ModuleChips modules={row?.modules ?? []} caption="Hubs they want to open:" />
        <span className="muted" style={{ fontSize: 11, textAlign: 'right', maxWidth: 240, lineHeight: 1.5 }}>
          They chose these. You can change them any time afterwards.
        </span>
      </div>
    );
  }
  if (rel === 'blocked') return <Button variant="line" size="sm" disabled>Unavailable</Button>;
  return (
    <div>
      <Button variant="accent" size="sm" disabled={requestConn.isPending} onClick={() => void connect()}>Connect</Button>
      {connErr && <p role="alert" className="sl-fail-alert">{connErr}</p>}
    </div>
  );
}

/** Block / Report safety actions for a person, shown in their profile modal. */
function SafetyActions({ id, handle, onBlocked }: { id: string; handle: string; onBlocked: () => void }) {
  const block = useBlock();
  /**
   * A SAFETY ACTION THAT FAILS SILENTLY IS THE WORST FAILURE HERE (30 Aug audit).
   *
   * Both of these were `mutate(..., { onSuccess })` with no `onError`. The
   * modal simply stayed open on a failure — so a citizen blocked a harasser,
   * the request never landed, nothing told them, and they carried on believing
   * they were protected. Every other silent mutation in this hub costs somebody
   * a retry; this one costs them the thing they came here for.
   */
  const [failed, setFailed] = useState<'block' | null>(null);
  const [asking, setAsking] = useState(false);

  const doBlock = () => {
    setFailed(null);
    block.mutate({ handle }, {
      onSuccess: () => { setAsking(false); onBlocked(); },
      onError: () => { setAsking(false); setFailed('block'); },
    });
  };


  return (
    <div className="sl-safety">
      <div className="sl-safety-row">
        <button type="button" onClick={() => setAsking(true)} disabled={block.isPending}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--danger-ink)', padding: 0 }}>
          {block.isPending ? 'Blocking…' : <><Icon name="block" size={14} /> Block</>}
        </button>
        <Confirm open={asking} title={`Block @${handle}?`}
          body="They won't be able to see your posts or interact with you, and you won't see theirs. You can undo this from Blocked people, under Settings."
          confirmLabel={block.isPending ? 'Blocking…' : 'Block'} danger busy={block.isPending}
          onClose={() => setAsking(false)} onConfirm={doBlock} />
        {/* `window.prompt` was the whole reporting flow for a person: no
            categories, no cancel on some mobile browsers, and nothing at all
            wherever popups are blocked. Same picker the posts and comments
            use. */}
        <ReportMenu targetType="user" targetId={id} />
      </div>
      {failed === 'block' && (
        <p role="alert" className="sl-fail-alert">
          That block didn’t go through — you are NOT blocking them yet. Try again in a moment.
        </p>
      )}
    </div>
  );
}

export function PublicProfileModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const q = usePublicProfile(handle);
  const p = q.data as PublicProfile | undefined;
  const sheet = useDialog(onClose);
  return (
    <div onClick={onClose} className="sheet-ov is-centred">
      <div ref={sheet} role="dialog" aria-modal="true" aria-label={p ? `${p.name}'s profile` : 'Profile'} tabIndex={-1}
        onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: 'min(460px,94vw)', maxHeight: '86vh', overflow: 'auto' }}>
        {q.isLoading && <Spinner label="Loading profile…" />}
        {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load that profile.</p>}
        {p && (
          <>
            <div style={{ display: 'flex', gap: 'var(--space-14)', alignItems: 'center' }}>
              <Avatar src={p.profileImage} name={p.name} size={64} />
              <div className="flex-min">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{p.name}</h3>{p.verified && <EmailConfirmedMark />}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>@{p.handle}</div>
                {p.city && <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="place" size={13} />{p.city}</div>}
              </div>
            </div>
            {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' }}>{p.bio}</p>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{p.website.replace(/^https?:\/\//, '')}</a>}
            <div style={{ display: 'flex', gap: 22, margin: '14px 0' }}>
              <StatCell n={p.stats.posts} label="posts" />
              <StatCell n={p.stats.cityPoints} label="city points" />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-8)', justifyContent: 'flex-end', alignItems: 'center' }}>
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
  const openFrom = useRef<DOMRect | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const fetchMore = useCallback(() => { void postsRef.current.fetchNextPage(); }, []);
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
      if (entries[0].isIntersecting && !posts.isFetchingNextPage) fetchMore();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts.hasNextPage, posts.isFetchingNextPage, fetchMore]);

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
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '44px 24px', marginTop: 'var(--space-16)' }}>
        <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name={filter === 'video' ? 'video' : filter === 'photo' ? 'camera' : 'grid'} size={30} /></span>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>No {noun}s to show.</p>
      </div>
    );
  }
  return (
    <>
      <div className="rise d1 social-grid" style={{ marginTop: 'var(--space-16)' }}>
        {view.map((p) => (
          <button key={p.id} type="button" onClick={(e) => { openFrom.current = e.currentTarget.getBoundingClientRect(); setOpenId(p.id); }}
            style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}>
            <PostTile p={p} />
          </button>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} />
      {posts.isFetchingNextPage && <div style={{ padding: 'var(--space-16)' }}><Spinner /></div>}
      {(() => {
        const op = openId ? view.find((x) => x.id === openId) : null;
        if (!op) return null;
        return (
          <PostReader
            posts={view.map((x) => ({ post: profilePostToPost(x) }))}
            startId={op.id}
            originRect={openFrom.current}
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
        <p className="muted" style={{ marginTop: 'var(--space-16)' }}>Couldn't load that profile.</p>
      </div>
    );
  }
  // "Joined Invalid Date" is what a null memberSince printed here.
  const joinedAt = new Date(p.memberSince);
  const joined = Number.isNaN(joinedAt.getTime()) ? '' : joinedAt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <button type="button" className="btn btn-line btn-sm" style={{ marginBottom: 'var(--space-18)' }} onClick={() => navigate(-1)}><Icon name="back" size={15} /> Back</button>

      <div className="card rise" style={{ display: 'flex', gap: 'var(--space-24)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-8)' }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <EmailConfirmedMark />}</h1>
            <FollowButton userId={p.id} handle={p.handle} iFollow={p.iFollow} />
            <ConnectButton id={p.id} handle={p.handle} relationship={p.relationship} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-2)' }}>
            <span>@{p.handle}</span>{joined && <> · Joined {joined}</>}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="place" size={14} />{p.city}</p>}
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 560 }}>{p.bio}</p>}
          {p.website && <p style={{ margin: '4px 0 0' }}><a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>{p.website.replace(/^https?:\/\//, '')}</a></p>}
          <div style={{ display: 'flex', gap: 22, margin: '12px 0 0', flexWrap: 'wrap' }}>
            <StatCell n={p.stats.posts} label="posts" />
            <StatCell n={p.stats.followers} label="followers" />
            <StatCell n={p.stats.following} label="following" />
            <StatCell n={p.stats.cityPoints} label="city points" />
          </div>
          <div style={{ marginTop: 'var(--space-12)' }}>
            <SafetyActions id={p.id} handle={p.handle} onBlocked={() => navigate('/social/feed')} />
          </div>
        </div>
      </div>

      <div className="rise d1" style={{ display: 'flex', gap: 'var(--space-8)', marginTop: 'var(--space-20)', flexWrap: 'wrap' }}>
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
    <div className="rise d1" style={{ marginTop: 'var(--space-16)' }}>
      <div className="card" style={{ marginBottom: 'var(--space-14)' }}>
        <h4 style={{ margin: '0 0 4px' }}>Find people</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 'var(--space-12)' }}>Search by name, @handle or Together City ID, then connect.</p>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
          <span className="muted" style={{ display: 'inline-flex' }}><Icon name="search" size={15} /></span>
          <input value={q} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQ(e.target.value)} placeholder="Search name or @handle"
            style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {dq.trim().length >= 2 && (
          <div style={{ marginTop: 'var(--space-12)' }}>
            {search.isLoading && <Spinner />}
            {/* Stating that somebody is not a member of the city, on the
                strength of a request that failed, is a claim this screen was
                making and could not support. */}
            {search.isError && <p className="sl-note-p">Couldn’t search just now — try again in a moment.</p>}
            {!search.isLoading && !search.isError && results.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No members match “{dq}”.</p>}
            {results.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', padding: '10px 2px', borderTop: '1px solid var(--line)' }}>
                <Avatar src={r.profileImage} name={r.name} size={40} />
                <div className="flex-min">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>{r.verified && <EmailConfirmedMark />}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <span>@{r.handle}</span>{r.city ? ` · ${r.city}` : ''}
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
  const sheet = useDialog(onClose);

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
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="tc-edit-profile-title" tabIndex={-1}
        onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: 'min(500px,94vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="blk-head"><h3 id="tc-edit-profile-title">Edit profile</h3></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-14)', marginTop: 'var(--space-8)' }}>
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

        {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 'var(--space-12)' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 'var(--space-8)', justifyContent: 'flex-end', marginTop: 'var(--space-18)' }}>
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
      <div className="card" style={{ marginBottom: 'var(--space-16)' }}>
        <div className="eyebrow">Post &amp; Earn</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1.2, marginTop: 'var(--space-6)' }}>Not open yet</div>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 'var(--space-8)', maxWidth: '54ch' }}>
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

      <div className="card" style={{ marginTop: 'var(--space-16)' }}>
        <div className="blk-head"><h3>The kinds of stories we mean</h3></div>
        <div style={{ marginTop: 'var(--space-10)' }}>
          {TOPICS.map((t) => (
            <span key={t} className="tag" style={{ margin: '0 6px 6px 0' }}>{t}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-16)' }}>
        <div className="blk-head"><h3>Your videos</h3><span className="muted" style={{ fontSize: 12 }}>{videos.length}</span></div>
        {videos.length === 0
          ? <p className="muted" style={{ fontSize: 12.5, marginTop: 'var(--space-8)' }}>You haven’t posted a video yet.</p>
          : videos.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-12)', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
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
  /**
   * A TAP THAT DID NOTHING LOOKED EXACTLY LIKE A TAP THAT WORKED (30 Aug).
   *
   * The label here reads `person.iFollow`, which only moves when the list
   * refetches — which only happens on success. So a failed follow left the
   * button saying "Follow", the citizen tapped again, and again.
   *
   * And one failure is not an accident: `follow()` refuses with 403 when
   * either of them has blocked the other. Somebody trying to follow a person
   * who blocked them could tap forever and never be told anything, which is
   * the one case where silence is worst — the server has a real answer and
   * the screen was swallowing it. The server's own sentence is preferred
   * over ours for exactly that reason.
   */
  const [failed, setFailed] = useState<string | null>(null);
  const said = (e: unknown) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  const act = () => {
    if (busy) return;
    setFailed(null);
    if (person.iFollow) {
      unfollow.mutate(person.id, { onError: (e) => setFailed(said(e) ?? 'That didn’t go through — you’re still following them. Try again.') });
    } else {
      follow.mutate({ handle: person.handle }, { onError: (e) => setFailed(said(e) ?? 'That didn’t go through — you’re not following them yet. Try again.') });
    }
  };
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', padding: '11px 14px' }}>
      <button type="button" onClick={onView} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
        <Avatar src={person.profileImage} name={person.name} size={44} />
      </button>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onView}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name}</div>
        <div className="muted" style={{ fontSize: 12 }}>@{person.handle}{person.followsMe && !person.iFollow ? ' · follows you' : ''}</div>
      </div>
      <div>
        <Button variant={person.iFollow ? 'line' : 'accent'} size="sm" disabled={busy} onClick={act}>
          {busy ? '…' : label}
        </Button>
        {failed && <p role="alert" className="sl-fail-alert">{failed}</p>}
      </div>
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
  /* Paged since 30 Aug — both lists used to read the whole graph and fetch a
     full profile row for every person in it, to render one screenful. */
  const people = (q.data?.pages ?? []).flatMap((pg) => pg.items);
  if (q.isLoading) return <div style={{ marginTop: 'var(--space-16)' }}><Spinner label={`Loading ${kind}…`} /></div>;
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
      <p className="muted" style={{ fontSize: 13.5, marginTop: 'var(--space-20)' }}>
        {kind === 'followers' ? 'No followers yet.' : "You're not following anyone yet. Find people to follow below."}
      </p>
    );
  }
  return (
    <div className="rise d1" style={{ display: 'grid', gap: 'var(--space-8)', marginTop: 'var(--space-16)', maxWidth: 560 }}>
      {people.map((person) => <FollowRow key={person.id} person={person} onView={() => setPeek(person.handle)} />)}
      {q.hasNextPage && (
        <button type="button" className="btn btn-line btn-sm sl-more"
          disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Loading…' : `Show more ${kind}`}
        </button>
      )}
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
  // "Joined Invalid Date" is what a null memberSince printed here.
  const joinedAt = new Date(p.memberSince);
  const joined = Number.isNaN(joinedAt.getTime()) ? '' : joinedAt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="card rise" style={{ display: 'flex', gap: 'var(--space-24)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-8)' }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <EmailConfirmedMark />}</h1>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} /> Edit profile
            </button>
            <Link className="btn btn-accent btn-sm" to="/social/create"><Icon name="plus" size={15} /> New post</Link>
          </div>
          {/* Account tabs sit right beside Edit profile (moved out of the content
              tab bar below). */}
          <div style={{ display: 'flex', gap: 9, marginTop: 'var(--space-12)', flexWrap: 'wrap' }}>
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
          <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-2)' }}>
            <span>@{p.handle}</span>{joined && <> · Joined {joined}</>}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="place" size={14} />{p.city}</p>}
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

      {/* The row is the five grids. Followers, Following and Post & Earn are
          reached from the chips above and are not tabs of this row — when one
          of them is open, no tab is selected, which is the truth. */}
      <Tablist className="rise d1" label="Your posts" value={tab} panelId="profile-grid-panel" onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: 'posts', label: <><Icon name="grid" size={15} />Posts</> },
          { key: 'photos', label: <><Icon name="camera" size={15} />Photos</> },
          { key: 'videos', label: <><Icon name="video" size={15} />Videos</> },
          { key: 'personal', label: <><Icon name="personal" size={15} />Personal</> },
          { key: 'work', label: <><Icon name="job" size={15} />Work</> },
        ]} />

      <div id="profile-grid-panel" role="tabpanel">
      {tab === 'posts' && <PostsTab />}
      {tab === 'photos' && <PostsTab filter="photo" />}
      {tab === 'videos' && <PostsTab filter="video" />}
      {tab === 'personal' && <PostsTab category="personal" />}
      {tab === 'work' && <PostsTab category="work" />}
      {tab === 'followers' && <FollowList kind="followers" />}
      {tab === 'following' && (<><FollowList kind="following" /><PeopleTab /></>)}
      {tab === 'earn' && <div className="rise d1" style={{ marginTop: 'var(--space-16)' }}><EarnView posts={allPosts} /></div>}
      </div>

      {editing && <EditProfileModal me={p} onClose={() => setEditing(false)} />}
    </div>
  );
}
