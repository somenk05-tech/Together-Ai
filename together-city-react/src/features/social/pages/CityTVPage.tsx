import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { NotFound } from '@/pages/NotFound';
import { Icon } from '@/components/ui/Icon';
import { useScrollLock } from '@/hooks/useScrollLock';
import { CityTV } from '../CityTV';
import { useFeed } from '../api';

/**
 * THE TV PAGE — owner, 5 Sep: "remove all this from the TV page, it needs to
 * be a full screen TV." No heading, no composer, no tabs, no wall: the
 * viewport is the screen. Two small things sit over it — a way back into the
 * city, and the one door to posting — and the remote the set draws itself.
 *
 * WHEN THE CHANNEL IS FURTHER DOWN. `/@handle` names a citizen; if their
 * first video is not in the pages loaded yet, the page keeps loading pages
 * until it is, or until there are none, and only then switches the set on —
 * a set switched on early would open on the wrong channel.
 *
 * NO SIDE PANELS. The page is a portal over the whole document, so the
 * hub's rail and the site header are behind it, not beside it — a full
 * screen feel before the full-screen key is ever pressed.
 *
 * The stream is the city-wide Videos lens, the same pages the Videos tab of
 * the wall reads. `/@<handle>` tunes the set to that citizen's first video
 * (the channels page sends people there), and `?channel=<handle>` on this
 * path does the same for every link shared before the short address existed;
 * `?shuffle` starts somewhere else in what is loaded.
 */
export function CityTVPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /* THE HANDLE ARRIVES TWO WAYS AND MEANS ONE THING. `/@somen` is the address
     a citizen shares; `?channel=somen` is what every link sent before today
     carries, and the channels page's own tiles used to build it. The path wins
     where both are present, because that is the address in the bar.

     THE '@' IS SLICED HERE RATHER THAN MATCHED IN THE ROUTE, because a router
     param is a WHOLE segment: `/@:handle` compiles to a path that matches
     nothing, silently, and the channel link would 404 with every test on this
     page still green. `ChannelAddress` below is what refuses the segments that
     are not a handle. */
  const { vanity } = useParams();
  const pathHandle = vanity?.startsWith('@') ? vanity.slice(1) : undefined;
  const feed = useFeed('videos');
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const openAuthor = useCallback((h: string) => navigate(`/social/u/${encodeURIComponent(h)}`), [navigate]);
  const openChannels = useCallback(() => navigate('/social/channels'), [navigate]);
  /* WHERE LEAVING THE SET LANDS (owner, 6 Sep): "the together city button
     should take them to the together city social media profile page." Not the
     hub landing — somebody who has been watching the city is one tap from
     posting to it, and the profile is where their own posts, their stats and
     the door to a new one are. Escape lands in the same place, because two
     ways out of one room that arrive somewhere different is two rooms. */
  const leave = useCallback(() => navigate('/social/profile'), [navigate]);
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
  const channel = pathHandle ?? params.get('channel');
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

/**
 * ── THE SHORT ADDRESS (owner, 6 Sep) ────────────────────────────────────────
 *
 * "togethercity.app/social/feed?channel=somen — rename this to
 * togethercity.app/@somen." A link somebody puts in a bio has to be sayable
 * out loud, and a query string on an internal route is neither.
 *
 * IT SITS AT THE ROOT, WHICH IS WHY IT IS GUARDED. A router param is a whole
 * segment, so the route is `/:vanity` and it is the LAST single-segment route
 * the ranking reaches — every hub name still wins it. Anything arriving here
 * that does not begin with '@' is a wrong turn rather than a citizen, and gets
 * the city's own 404 instead of a television tuned to nobody.
 */
export function ChannelAddress() {
  const { vanity } = useParams();
  return vanity && vanity.length > 1 && vanity.startsWith('@') ? <CityTVPage /> : <NotFound />;
}
