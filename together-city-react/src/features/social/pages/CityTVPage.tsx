import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useScrollLock } from '@/hooks/useScrollLock';
import { CityTV } from '../CityTV';
import { useFeed } from '../api';

/**
 * THE TV PAGE — owner, 5 Sep: "remove all this from the TV page, it needs to
 * be a full screen TV." No heading, no composer, no tabs, no wall: the
 * viewport is the screen. Two small things sit over it — a way back to the
 * hub, and the one door to posting — and the remote the set draws itself.
 *
 * WHEN THE CHANNEL IS FURTHER DOWN. `?channel=` names a citizen; if their
 * first video is not in the pages loaded yet, the page keeps loading pages
 * until it is, or until there are none, and only then switches the set on —
 * a set switched on early would open on the wrong channel.
 *
 * NO SIDE PANELS. The page is a portal over the whole document, so the
 * hub's rail and the site header are behind it, not beside it — a full
 * screen feel before the full-screen key is ever pressed.
 *
 * The stream is the city-wide Videos lens, the same pages the Videos tab of
 * the wall reads. `?channel=<handle>` tunes the set to that citizen's first
 * video (the channels page sends people here); `?shuffle` starts somewhere
 * else in what is loaded.
 */
export function CityTVPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const feed = useFeed('videos');
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const openAuthor = useCallback((h: string) => navigate(`/social/u/${encodeURIComponent(h)}`), [navigate]);
  const openChannels = useCallback(() => navigate('/social/channels'), [navigate]);
  const leave = useCallback(() => navigate('/social'), [navigate]);
  const { fetchNextPage } = feed;
  const more = useCallback(() => { void fetchNextPage(); }, [fetchNextPage]);
  useScrollLock(true);
  /* NOT useBackToClose. That hook is for overlays driven by component state
     — it pushes a history entry and, when its own button closes it, pops the
     entry back. This page is a ROUTE: with the hook, the "Together City"
     button navigated away, the hook then went back, the TV came on again,
     and the citizen could not leave (owner, 5 Sep: "not able to go back to
     the city"). A route leaves by navigating; Back leaves on its own. */

  const head = (
    <div className="tv-room-top">
      <button type="button" onClick={leave} className="btn btn-sm"><Icon name="back" size={15} /> Together City</button>
      <Link to="/social/create" className="btn btn-sm"><Icon name="plus" size={15} /> Create</Link>
    </div>
  );
  const channel = params.get('channel');
  const found = channel ? items.findIndex((p) => p.author?.handle === channel) : -1;
  const { hasNextPage, isFetchingNextPage } = feed;
  // Six pages is as far as the stream keeps; past that a search would run forever.
  const searching = Boolean(channel) && found < 0 && hasNextPage && (feed.data?.pages.length ?? 0) < 6;
  useEffect(() => {
    if (searching && !isFetchingNextPage) void fetchNextPage();
  }, [searching, isFetchingNextPage, fetchNextPage, items.length]);
  const startAt = channel
    ? Math.max(0, found)
    : params.has('shuffle') && items.length ? Math.floor(Math.random() * items.length) : 0;

  return createPortal(
    <div className="tv-room">
      {items.length === 0 && head}
      {feed.isLoading && <div className="tv-room-mid"><Spinner label="Tuning in…" /></div>}
      {feed.isError && (
        <div className="tv-room-mid">
          <div className="sl-fail">
            <p className="sl-fail-t">Couldn’t tune in.</p>
            <p className="sl-fail-h">This is a connection problem.</p>
            <button type="button" className="btn btn-line btn-sm" onClick={() => void feed.refetch()}>Try again</button>
          </div>
        </div>
      )}
      {!feed.isLoading && !feed.isError && items.length === 0 && (
        <div className="tv-room-mid">
          <div className="sl-fail">
            <p className="sl-fail-t">Nothing on yet.</p>
            <p className="sl-fail-h">Post a video and it plays here.</p>
          </div>
        </div>
      )}
      {items.length > 0 && !searching && (
        <CityTV key={channel ?? 'tv'} items={items} startAt={startAt}
          hasNextPage={feed.hasNextPage} fetchNextPage={more}
          onOpenChannel={openAuthor} onOpenChannels={openChannels} onLeave={leave} head={head} />
      )}
    </div>,
    document.body,
  );
}
