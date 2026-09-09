import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui';
import { PostCard } from '../PostCard';
import { useFeed } from '../api';

/**
 * ── CITY PHOTOS (/social/images) ────────────────────────────────────────────
 *
 * Owner, 8 Sep: "create a tab for city images, and only let users scroll
 * images people may have uploaded." And 9 Sep, on seeing it: "just the photos
 * and thoughts."
 *
 * The still half of the city. City TV plays the videos on their own, full
 * screen, a channel at a time; this is everything else citizens post —
 * photographs and the text-only thoughts between them — read the way stills
 * are read, a column you scroll at your own pace, whole city, newest first.
 *
 * IT READS `stills`, NOT `photos`, AND THAT IS THE WHOLE DESIGN. The `photos`
 * lens asks for posts that HAVE a photograph, which is not the same sentence
 * as "posts that are not videos": a post carrying four pictures and a clip
 * satisfies it, and this page would have autoplayed a video in the middle of
 * the scroll. `stills` asks the opposite question on the server — no video
 * media, and no reposts, because a repost row carries no media of its own and
 * would slip a video through the gap. One predicate, one cursor, and the
 * correct newest-first order across both kinds.
 *
 * WHY NOT MERGE TWO LENSES IN THE CLIENT: two cursors interleaved by hand is
 * two pagers that disagree about what "next" means the moment one runs out.
 * The database already knows how to order a single query by date.
 */
export function CityImages() {
  const nav = useNavigate();
  const feed = useFeed('stills');
  const stills = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);

  const sentinel = useRef<HTMLDivElement>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feed;
  const more = useCallback(() => { void fetchNextPage(); }, [fetchNextPage]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) more();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, more]);

  /* The empty state waits until the lens itself is exhausted rather than
     firing on a first page that has not arrived. */
  const exhausted = !hasNextPage && !isFetchingNextPage && !feed.isLoading;

  return (
    <div className="page-note">
      <div className="blk rise">
        <div className="blk-head">
          <h2><Icon name="image" size={18} /> City Photos</h2>
        </div>
        <p className="muted sl-lede">Photographs and thoughts from across the city, newest first.</p>
      </div>

      {feed.isLoading && <Spinner label="Loading posts…" />}

      {feed.isError && (
        <div className="blk rise d1 sl-fail">
          <p className="sl-fail-t">Couldn’t load these posts.</p>
          <p className="sl-fail-h">This is a connection problem, not an empty city.</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>
        </div>
      )}

      {stills.map((p) => (
        <div key={p.key ?? p.id} className="sl-read-item">
          <PostCard post={p} onOpenAuthor={(handle) => nav(`/social/u/${encodeURIComponent(handle)}`)} />
        </div>
      ))}

      {!feed.isError && exhausted && stills.length === 0 && (
        <div className="blk rise d1 sl-empty">
          <span className="sl-ic lg sl-empty-ic"><Icon name="camera" size={30} /></span>
          <p className="muted sl-empty-p">Nothing here yet — post a photograph or a thought and it shows up.</p>
        </div>
      )}

      <div ref={sentinel} className="sl-sentinel" />
      {isFetchingNextPage && <div className="sl-more"><Spinner /></div>}
    </div>
  );
}
