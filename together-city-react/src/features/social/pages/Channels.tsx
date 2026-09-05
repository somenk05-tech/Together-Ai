import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { onStaleMedia } from '@/lib/remint';
import { Avatar } from '../PostCard';
import { channelsOf } from '../city-tv';
import { useFeed } from '../api';

/**
 * TOGETHER CITY CHANNELS — owner, 5 Sep: "a channel page added on the left
 * tab which says Together City Channels", drawn like the reference's
 * channels wall "but much sleeker and smaller".
 *
 * A wall of small tiles, Shuffle first, one per citizen with a video in the
 * stream: their newest video's poster, their name in small caps beneath.
 * Tapping a tile switches the set on, tuned to that citizen; the citizen's
 * own page is one tap further, from the channel name on the remote.
 *
 * The channels are read off the same Videos pages the set plays, so a
 * channel here is always a channel there. The page keeps loading pages
 * while there are more, because a channel on page four is still a channel.
 */
export function Channels() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const feed = useFeed('videos');
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const channels = useMemo(() => channelsOf(items), [items]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);
  const stale = () => onStaleMedia(qc, ['social']);

  return (
    <div>
      <div className="sl-head">
        <div className="sl-head-t">
          <div className="eyebrow">Together City TV</div>
          <h1>Together City Channels</h1>
          <p>Every channel is a citizen. Tap one and the set tunes in.</p>
        </div>
      </div>

      {feed.isLoading && <Spinner label="Finding the channels…" />}
      {feed.isError && (
        <EmptyState title="Couldn't load the channels"
          hint="This is a connection problem — the city is still there."
          action={<button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>} />
      )}
      {!feed.isLoading && !feed.isError && channels.length === 0 && (
        <EmptyState title="No channels yet" hint="A citizen becomes a channel the moment they post a video." />
      )}

      {channels.length > 0 && (
        <div className="tv-grid" role="list" aria-label="Channels">
          <button type="button" className="tv-tile tv-tile-shuffle" role="listitem" onClick={() => navigate('/social/feed?shuffle')}>
            <span className="tv-tile-img"><Icon name="reorder" size={26} /></span>
            <span className="tv-tile-n">Shuffle all</span>
          </button>
          {channels.map((c) => (
            <button type="button" className="tv-tile" role="listitem" key={c.handle}
              onClick={() => navigate(`/social/feed?channel=${encodeURIComponent(c.handle)}`)} aria-label={`Watch ${c.name}`}>
              <span className="tv-tile-img">
                {c.tile ? <img src={c.tile} alt="" loading="lazy" onError={stale} /> : <Avatar name={c.name} src={c.profileImage} />}
              </span>
              <span className="tv-tile-n">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
