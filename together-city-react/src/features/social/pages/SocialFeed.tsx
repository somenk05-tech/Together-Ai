import { useCallback, useEffect, useRef, useState } from 'react';
import { informalName } from '@/lib/salutation';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, PostCard } from '../PostCard';
import { Poster } from '../Poster';
import { ReelsView } from '../ReelsView';
import { useFeed } from '../api';


/* The icon is a NAME, not a picture, and never an emoji. Icon.tsx's own rule:
 * chrome uses the line set; emoji are for what a citizen writes. These five are
 * tabs, which is chrome, and they carried emoji until now. */
const FILTERS: ReadonlyArray<{ key: string; label: string; icon?: IconName }> = [
  { key: 'foryou', label: 'For You' },
  { key: 'photos', label: 'Photos', icon: 'camera' },
  { key: 'videos', label: 'Videos', icon: 'video' },
  { key: 'thoughts', label: 'Thoughts', icon: 'chat' },
  { key: 'friends', label: 'Friends', icon: 'people' },
];

/**
 * THE FOUR DOORS ON THE COMPOSER, AND WHY NONE OF THEM IS A COMPOSER.
 *
 * The reference draws a write-box at the top of the feed with Photo, Video,
 * Thought and Place under it. A second real composer here would be a second
 * copy of Create Post's upload, compression, audience and error handling —
 * the shape rule 2 exists to refuse. So the box is a DOOR: it opens the one
 * composer that exists, already on the control you tapped, and `tool` is the
 * name Create Post already uses for its own panels.
 */
const QUICKS: ReadonlyArray<{ tool: string; label: string; icon: IconName }> = [
  { tool: 'photos', label: 'Photo', icon: 'camera' },
  { tool: 'video', label: 'Video', icon: 'video' },
  { tool: '', label: 'Thought', icon: 'chat' },
  { tool: 'location', label: 'Place', icon: 'place' },
];

/** Social Life — one intelligent feed: friends, check-ins, travel moments,
 *  videos, business updates and community posts in a single clean stream. */
export function SocialFeed() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('foryou');
  const feed = useFeed(filter);
  const showFilter = (key: string) => { setOpenKey(null); setFilter(key); };
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  // Stable, so the memoised PostCards don't all re-render when this page does.
  const openAuthor = useCallback((h: string) => navigate(`/social/u/${encodeURIComponent(h)}`), [navigate]);
  /**
   * A PHONE READS ONE POST AT A TIME; A DESKTOP READS A WALL.
   *
   * Mount-time matchMedia at the app's own phone breakpoint, the same way
   * Chats, Home and the reels player each decide the question. Rendering both
   * and hiding one in CSS would load every photograph twice.
   */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;

  // Post-share landing: highlight the new post, scroll to top, flash a toast.
  const navState = location.state as { newPostId?: string; justShared?: boolean } | null;
  const [newPostId, setNewPostId] = useState<string | null>(null);
  // Which poster is open, by FEED KEY rather than post id — a repost and its
  // original are two entries carrying the same post, and keying on the id would
  // open both.
  const [openKey, setOpenKey] = useState<string | null>(null);
  /**
   * SCROLL MODE, OPENED WHERE THEY TAPPED.
   *
   * A tile is a thumbnail of something, and the thing it is a thumbnail of is
   * the whole post at full size. Expanding it in place kept the citizen's
   * scroll position but made every post a separate decision to open and close;
   * scroll mode makes the feed one continuous thing, which is what a feed is.
   *
   * Null means the wall. A number means scroll mode, opened on that index.
   */
  const [reelAt, setReelAt] = useState<number | null>(null);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!navState?.justShared) return;
    setNewPostId(navState.newPostId ?? null);
    setToast(true);
    // Instant, not smooth: the citizen just posted and wants to SEE it, not
    // watch the page travel. (The app's scrolling is native everywhere now —
    // no animated scrolling anywhere on a gesture path.)
    window.scrollTo(0, 0);
    // Clear router state so a refresh/back doesn't re-trigger the toast.
    navigate(location.pathname, { replace: true, state: null });
    const t1 = window.setTimeout(() => setToast(false), 3000);
    const t2 = window.setTimeout(() => setNewPostId(null), 12000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * THE NEXT PAGE ARRIVES BEFORE ANYBODY ASKS FOR IT.
   *
   * "Load more" was a decision the citizen had to make at the bottom of every
   * twenty posts — scroll, stop, find the button, tap, wait. The sentinel
   * fetches the next page while the current one still has ~1200px to run, so
   * under normal scrolling the join is never seen. The button stays, as the
   * fallback and the accessible path; the network request never lives inside
   * a scroll handler.
   */
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !feed.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !feed.isFetchingNextPage) void feed.fetchNextPage();
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed]);

  // Lock the page behind the full-screen reels so only the reels scroll.
  useEffect(() => {
    if (filter !== 'videos' && reelAt == null) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [filter, reelAt]);

  // Videos = full-screen immersive reels: nothing else on the page. A single
  // back button returns to the City Feed (For You).
  /**
   * Scroll mode is the same full-screen player the Videos tab uses, opened out
   * of any tab and on any post. One implementation, so the two cannot end up
   * behaving differently — and closing it returns to the wall exactly where it
   * was, because the wall was never unmounted.
   */
  if (reelAt != null && items.length > 0) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'var(--card)', zIndex: 1000 }}>
        <button type="button" onClick={() => setReelAt(null)} className="btn btn-sm"
          style={{ position: 'absolute', top: 14, left: 14, zIndex: 4 }}>
          <Icon name="back" size={15} /> Back to the feed
        </button>
        <ReelsView items={items} onOpenAuthor={openAuthor} fullScreen startAt={Math.max(0, reelAt)}
          hasNextPage={feed.hasNextPage} fetchNextPage={() => void feed.fetchNextPage()} isFetchingNextPage={feed.isFetchingNextPage} />
      </div>,
      document.body,
    );
  }

  if (filter === 'videos') {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'var(--card)', zIndex: 1000 }}>
        <button type="button" onClick={() => setFilter('foryou')} className="btn btn-sm"
          style={{ position: 'absolute', top: 14, left: 14, zIndex: 4 }}>
          <Icon name="back" size={15} /> City Feed
        </button>
        {feed.isLoading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Spinner label="Loading videos…" /></div>}
        {!feed.isLoading && !feed.isError && items.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
            <div>
              <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name="video" size={30} /></span>
              <p style={{ fontSize: 15, margin: 0 }}>No videos yet — post one and it'll play here, reels-style.</p>
            </div>
          </div>
        )}
        {items.length > 0 && (
          <ReelsView items={items} onOpenAuthor={openAuthor} fullScreen
            hasNextPage={feed.hasNextPage} fetchNextPage={() => void feed.fetchNextPage()} isFetchingNextPage={feed.isFetchingNextPage} />
        )}
      </div>,
      document.body,
    );
  }

  return (
    <div>
      {toast && (
        <div role="status" style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
          background: 'var(--ok-ink)', color: 'var(--on-accent)', borderRadius: 'var(--r-full)', padding: '11px 20px', fontSize: 13.5, fontWeight: 600,
          boxShadow: 'var(--e3)', animation: 'tc-rise .3s ease-out', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="accepted" size={16} /> Your post has been shared to your city.
        </div>
      )}

      <div className="sl-head">
        <div className="sl-head-t">
          <div className="eyebrow">City Feed</div>
          <h1>{user ? `What's happening, ${informalName(user.name)}?` : 'The city feed'}</h1>
          <p>People, places and moments from your city.</p>
        </div>
        <Link to="/social/create" className="btn btn-accent">
          <Icon name="plus" size={17} /> Create
        </Link>
      </div>

      {/* THE WRITE-BOX IS A DOOR. See QUICKS above for why it is not a second
          composer. It carries the citizen's own avatar so the row reads as
          "you, about to say something" rather than as a search field. */}
      <div className="card sl-composer">
        <Link to="/social/create" className="sl-open">
          <Avatar name={user?.name ?? 'You'} src={user?.profileImage} />
          <span>What's on your mind?</span>
        </Link>
        <div className="sl-quicks">
          {QUICKS.map((q) => (
            <Link key={q.label} className="sl-quick" to="/social/create"
              state={q.tool ? { tool: q.tool } : null}>
              <Icon name={q.icon} size={17} />
              <span className="sl-quick-l">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* The rail says which of the five real feeds you are reading. It is the
          filter the API actually takes — no tab here is a name with nothing
          behind it. */}
      <div className="sl-tabs" role="tablist" aria-label="City feed">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" onClick={() => showFilter(f.key)}
            className={`sl-tab${filter === f.key ? ' on' : ''}`}
            aria-selected={filter === f.key}>
            {f.icon && <Icon name={f.icon} size={15} />}{f.label}
          </button>
        ))}
      </div>

      {feed.isLoading && <Spinner label="Loading the city feed…" />}
      {feed.isError && <EmptyState title="Couldn't load the feed" hint="Reload in a moment." />}

      {!feed.isLoading && !feed.isError && items.length === 0 && (
        <EmptyState title={filter === 'foryou' ? 'No moments yet' : 'Nothing here yet'} hint="Be the first to share one." />
      )}

      {items.length > 0 && (
        <>
          <div className="sl-band">
            <span className="sl-ic"><Icon name="grid" size={19} /></span>
            <span className="sl-band-t">
              <b>Today in Together City</b>
              <span>Real moments. Real people. Right now.</span>
            </span>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {items.length} {items.length === 1 ? 'moment' : 'moments'}
            </span>
          </div>

          {phone ? (
            /* ONE POST AT A TIME, WHOLE. On a phone column the poster tile and
               the post are the same width, so the tile is no longer a
               thumbnail of anything — it is the post with its caption cropped
               and its controls hidden behind a tap. The card shows all of it.
               `autoplayVideo` is the reader's machinery reused: the one
               mostly-visible video plays (with the citizen's own sound
               preference), pauses on the way out, and the next one is already
               buffered — the phone feed behaves like every reels feed the
               citizen already knows. */
            items.map((p) => (
              <PostCard key={p.key ?? p.id} post={p} isNew={p.id === newPostId} onOpenAuthor={openAuthor} autoplayVideo />
            ))
          ) : (
            /* THE WALL. An opened poster takes the full width in the place it
               already occupied and shows the post whole — caption, likes,
               comments, share, save — so nothing is lost by making the tile
               small, and closing it puts you back exactly where you were
               without restoring a scroll position. */
            <div className="wall">
              {items.map((p) => {
                const key = p.key ?? p.id;
                return key === openKey ? (
                  <div className="wall-open" key={key}>
                    <PostCard post={p} isNew={p.id === newPostId} onOpenAuthor={openAuthor} />
                    <div style={{ display: 'grid', placeItems: 'center', margin: '-4px 0 4px' }}>
                      <Button variant="line" size="sm" onClick={() => setOpenKey(null)}>Close</Button>
                    </div>
                  </div>
                ) : (
                  <Poster key={key} post={p} isNew={p.id === newPostId}
                    onOpen={() => setReelAt(items.findIndex((x) => (x.key ?? x.id) === key))} />
                );
              })}
            </div>
          )}

          <div ref={moreRef} aria-hidden />
          <div className="wall-rule foot">
            <span>{FILTERS.find((f) => f.key === filter)?.label ?? 'For you'}</span>
            {feed.hasNextPage ? (
              <button type="button" className="wall-more" disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}>
                {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            ) : <span>That's everything</span>}
          </div>
        </>
      )}
    </div>
  );
}
