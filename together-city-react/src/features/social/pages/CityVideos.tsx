import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from '../PostCard';
import { useFeed, useSetCover } from '../api';

/**
 * ── CITY VIDEOS (/social/videos) ────────────────────────────────────────────
 *
 * Owner, 10 Sep, pointing at the reader: "create city video tab on the side
 * bar, and make it in this exact look just with post from all people in this
 * format."
 *
 * City TV is the television — one video at a time, full screen, a remote. This
 * is the same city's videos read the way the reader reads a wall: a column of
 * full post cards, whole city, newest first, each clip playing as it comes
 * into view and handing on to the next video when it ends. The citizen's own
 * posts in the column keep the cover-frame tool the reader gives them, because
 * that card is theirs wherever it appears.
 *
 * It reads the server's `videos` lens — city-wide, posts that carry a video,
 * under the same audience, block and moderation gates as every other lens, so
 * a hidden post is never in it.
 */
export function CityVideos() {
  const nav = useNavigate();
  const { user } = useAuth();
  const feed = useFeed('videos');
  const videos = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const setCover = useSetCover();
  // A cover the server refused says why, under the column — never a silence.
  const [coverErr, setCoverErr] = useState<string | null>(null);

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

  /* The end of a clip travels to the next card — every card here has a video,
     so "next post" and "next video" are the same thing on this page. */
  const scroller = useRef<HTMLDivElement>(null);
  const advance = useCallback((fromKey: string) => {
    const i = videos.findIndex((p) => (p.key ?? p.id) === fromKey);
    const next = i >= 0 ? videos[i + 1] : undefined;
    if (!next) return;
    scroller.current?.querySelector<HTMLElement>(`[data-reader-post="${next.key ?? next.id}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [videos]);

  const exhausted = !hasNextPage && !isFetchingNextPage && !feed.isLoading;
  const isMine = (handle: string, id: string) => Boolean(user && (user.id === id || user.handle === handle));

  return (
    <div className="page-note">
      <div className="blk rise">
        <div className="blk-head">
          <h2><Icon name="video" size={18} /> City Videos</h2>
        </div>
        <p className="muted sl-lede">Videos from across the city, newest first.</p>
      </div>

      {feed.isLoading && <Spinner label="Loading videos…" />}

      {feed.isError && (
        <div className="blk rise d1 sl-fail">
          <p className="sl-fail-t">Couldn’t load these videos.</p>
          <p className="sl-fail-h">This is a connection problem, not an empty city.</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>
        </div>
      )}

      {coverErr && <p role="alert" className="sl-fail-alert">{coverErr}</p>}

      <div ref={scroller}>
        {videos.map((p) => {
          const k = p.key ?? p.id;
          const mine = isMine(p.author.handle, p.author.id) && !p.repostedBy;
          return (
            <div key={k} data-reader-post={k} className="sl-read-item">
              <PostCard
                post={p}
                autoplayVideo
                onVideoEnded={() => advance(k)}
                onOpenAuthor={(handle) => nav(`/social/u/${encodeURIComponent(handle)}`)}
                onSetCover={mine ? (t) => {
                  setCoverErr(null);
                  setCover.mutate({ postId: p.id, time: t }, {
                    onError: (e) => setCoverErr(
                      (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                      || 'That cover wasn’t set — the post still shows the frame it had. Try again.',
                    ),
                  });
                } : undefined}
                coverBusy={mine ? setCover.isPending : undefined} />
            </div>
          );
        })}
      </div>

      {!feed.isError && exhausted && videos.length === 0 && (
        <div className="blk rise d1 sl-empty">
          <span className="sl-ic lg sl-empty-ic"><Icon name="video" size={30} /></span>
          <p className="muted sl-empty-p">No videos yet — post one and it shows up here.</p>
        </div>
      )}

      <div ref={sentinel} className="sl-sentinel" />
      {isFetchingNextPage && <div className="sl-more"><Spinner /></div>}
    </div>
  );
}
