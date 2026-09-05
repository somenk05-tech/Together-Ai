import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useBackToClose } from '@/hooks/useBackToClose';
import { CityTV } from '../CityTV';
import { useFeed } from '../api';

/**
 * THE TV PAGE — owner, 5 Sep: "remove all this from the TV page, it needs to
 * be a full screen TV." No heading, no composer, no tabs, no wall: the
 * viewport is the screen. Two small things sit over it — a way back to the
 * hub, and the one door to posting — and the remote the set draws itself.
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
  useBackToClose(true, leave);

  const head = (
    <div className="tv-room-top">
      <button type="button" onClick={leave} className="btn btn-sm"><Icon name="back" size={15} /> Together City</button>
      <Link to="/social/create" className="btn btn-sm"><Icon name="plus" size={15} /> Create</Link>
    </div>
  );
  const channel = params.get('channel');
  const startAt = channel
    ? Math.max(0, items.findIndex((p) => p.author?.handle === channel))
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
      {items.length > 0 && (
        <CityTV key={channel ?? 'tv'} items={items} startAt={startAt}
          hasNextPage={feed.hasNextPage} fetchNextPage={more}
          onOpenChannel={openAuthor} onOpenChannels={openChannels} head={head} />
      )}
    </div>,
    document.body,
  );
}
