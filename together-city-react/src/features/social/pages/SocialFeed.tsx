import { useEffect, useState } from 'react';
import { informalName } from '@/lib/salutation';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from '../PostCard';
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
  const openAuthor = (h: string) => navigate(`/social/u/${encodeURIComponent(h)}`);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Clear router state so a refresh/back doesn't re-trigger the toast.
    navigate(location.pathname, { replace: true, state: null });
    const t1 = window.setTimeout(() => setToast(false), 3000);
    const t2 = window.setTimeout(() => setNewPostId(null), 12000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <button type="button" onClick={() => setReelAt(null)} className="g-key sm"
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
        <button type="button" onClick={() => setFilter('foryou')} className="g-key sm"
          style={{ position: 'absolute', top: 14, left: 14, zIndex: 4 }}>
          <Icon name="back" size={15} /> City Feed
        </button>
        {feed.isLoading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Spinner label="Loading videos…" /></div>}
        {!feed.isLoading && !feed.isError && items.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
            <div>
              <span className="g-well big" style={{ margin: '0 auto 14px' }}><Icon name="video" size={30} /></span>
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
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 16px' }}>
      {toast && (
        <div role="status" style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
          background: 'var(--ok-ink)', color: 'var(--on-accent)', borderRadius: 999, padding: '11px 20px', fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,.28)', animation: 'tc-rise .3s ease-out', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="accepted" size={16} /> Your post has been shared to your city.
        </div>
      )}
      <div className="eyebrow">Social Life</div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>
        {user ? `What's happening, ${informalName(user.name)}` : 'The city feed'}
      </h1>
      <p className="lede" style={{ marginBottom: 16 }}>Discover what's happening around you.</p>

      {/* The column was 640 wide, which is one poster and a lot of margin. The
          wall takes the page. */}
      <div>
        <div>
          {filter !== 'videos' && (
            <div style={{ marginBottom: 16 }}>
              <Link to="/social/create" className="btn btn-accent">
                <Icon name="plus" size={18} /> New post
              </Link>
            </div>
          )}

          {/* The tray is the point: the keys are raised out of a carved well, so
              "which one am I on" is a question about depth rather than colour. */}
          <div className="g-tray" style={{ marginBottom: 18 }}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => showFilter(f.key)}
                className={`g-key sm g-edge${filter === f.key ? ' on' : ''}`}
                aria-pressed={filter === f.key}>
                {f.icon && <Icon name={f.icon} size={15} />}{f.label}
              </button>
            ))}
          </div>

          {feed.isLoading && <Spinner label={filter === 'videos' ? 'Loading videos…' : 'Loading the city feed…'} />}
          {feed.isError && <EmptyState title="Couldn't load the feed" hint="Reload in a moment." />}

          {filter === 'videos' ? (
            <>
              {!feed.isLoading && !feed.isError && items.length === 0 && (
                <EmptyState title="No videos yet" hint="Post a video and it'll play here, reels-style." />
              )}
              {items.length > 0 && (
                <ReelsView items={items} onOpenAuthor={openAuthor}
                  hasNextPage={feed.hasNextPage} fetchNextPage={() => void feed.fetchNextPage()} isFetchingNextPage={feed.isFetchingNextPage} />
              )}
            </>
          ) : (
            <>
              {!feed.isLoading && !feed.isError && items.length === 0 && (
                <EmptyState title={filter === 'foryou' ? 'No moments yet' : 'Nothing here yet'} hint="Be the first to share one." />
              )}
              {items.length > 0 && (
                <>
                  <div className="wall-rule">
                    <span>{FILTERS.find((f) => f.key === filter)?.label ?? 'For you'}</span>
                    <span>Together City</span>
                  </div>

                  {/* THE WALL. An opened poster takes the full width in the
                      place it already occupied and shows the post whole —
                      caption, likes, comments, share, save — so nothing is lost
                      by making the tile small, and closing it puts you back
                      exactly where you were without restoring a scroll
                      position. */}
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

                  <div className="wall-rule foot">
                    <span>{items.length} {items.length === 1 ? 'moment' : 'moments'}</span>
                    {feed.hasNextPage ? (
                      <button type="button" className="wall-more" disabled={feed.isFetchingNextPage}
                        onClick={() => void feed.fetchNextPage()}>
                        {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
                      </button>
                    ) : <span>That's everything</span>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
