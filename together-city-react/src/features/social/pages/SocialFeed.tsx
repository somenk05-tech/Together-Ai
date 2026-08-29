import { useCallback, useEffect, useRef, useState } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useBackToClose } from '@/hooks/useBackToClose';
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
  /* A stable callback, so the observer below depends on two booleans rather
     than on the whole query result — see the deps note under it. */
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const fetchMore = useCallback(() => { void feedRef.current.fetchNextPage(); }, []);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !feed.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !feed.isFetchingNextPage) fetchMore();
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
    /* `feed` — the whole React Query result — was in this list, and it is a new
       object on every render. So the observer was torn down and rebuilt on
       every state change, every mute toggle, every cache patch; and with a
       1200px rootMargin and a sentinel just below the list, each rebuild fired
       immediately if the sentinel was still inside the margin. On a short feed
       that is a loop: fetch, re-render, rebuild, fire, fetch. The two booleans
       are what the effect actually reads. */
  }, [feed.hasNextPage, feed.isFetchingNextPage, fetchMore]);

  // Lock the page behind the full-screen reels so only the reels scroll.
  // The shared counted lock: iOS actually honours it (overflow:hidden alone
  // does not stop touch scroll), it restores the scroll position, and it
  // survives the post reader opening on top.
  useScrollLock(filter === 'videos' || reelAt != null);
  // Back closes the full-screen player rather than leaving Social Life. Two
  // calls, because the two surfaces close to different places: scroll mode
  // returns to the wall, the Videos tab returns to For You.
  useBackToClose(reelAt != null, () => setReelAt(null));
  useBackToClose(filter === 'videos', () => setFilter('foryou'));

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
        {/* This portal had a loading branch and an empty branch and no error
            branch, so a failed request rendered a blank full-screen rectangle
            containing one button: no spinner, no message, nothing to press. */}
        {feed.isError && (
          <div className="sl-reel-empty">
            <div className="sl-fail">
              <p className="sl-fail-t">Couldn’t load the videos.</p>
              <p className="sl-fail-h">This is a connection problem.</p>
              <button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>
            </div>
          </div>
        )}
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
        <div role="status" style={{ position: 'fixed', top: 'calc(18px + var(--safe-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 80,
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
      {/* No emoji in Social Life's chrome — relief.spec guards that, and it is
          right: the default mark plus a real retry says more than a warning
          sign does. */}
      {feed.isError && (
        <EmptyState title="Couldn't load the feed"
          hint="This is a connection problem — the city is still there."
          action={<button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>} />
      )}

      {/* "Be the first to share one" was a claim about the whole city, made by
          a tab that is bounded to your own network. The citizen could see
          photos on For You and then be told there were none. Photos, Thoughts
          and Friends are empty on day one BECAUSE they are bounded — so they
          say that, and point at the thing that fills them. */}
      {!feed.isLoading && !feed.isError && items.length === 0 && (
        filter === 'foryou'
          ? <EmptyState title="No moments yet" hint="Be the first to share one." />
          : <EmptyState title="Nothing here yet"
              hint={filter === 'friends'
                ? 'This tab shows your accepted connections. Connect with people and their posts collect here.'
                : 'This tab shows people you follow. Follow a few and their posts collect here — For You shows the whole city meanwhile.'} />
      )}

      {items.length > 0 && (
        <>
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
