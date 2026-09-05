import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { isMuted, setMuted, subscribeMuted, playWithSharedSound, releasePlayback } from '@/lib/mediaState';
import { onStaleMedia } from '@/lib/remint';
import { Avatar } from './PostCard';
import type { Post } from './api';
import { channelsOf, tuneIndex } from './city-tv';

/**
 * TOGETHER CITY TV — owner, 5 Sep: "create Together City TV instead of the
 * city feed, and the channel takes them to the profile"; then "it needs to
 * be a full screen tv, no images on the tv, and autoplay — the whole
 * Together City TV should be an autoplay TV."
 *
 * A television, not a wall. The screen is the whole viewport; a remote sits
 * over its foot — previous, pause, next, captions, sound, full screen,
 * channels — and the dial on the right shows whose video is on. The set
 * plays on its own: one video through to its end, then the next, then the
 * next page of the stream, and when the stream runs out it starts again
 * from the top. Nobody scrolls a television.
 *
 * VIDEOS ONLY. The stream is the city-wide Videos lens, so every post here
 * carries a video; a post that somehow does not is skipped without a frame
 * drawn. No photograph, no title card.
 *
 * A CHANNEL IS A CITIZEN. Up and down tune to the next citizen with a video
 * in the stream; tapping the channel opens the profile — the channel IS the
 * person. The channels wall is its own page (/social/channels); the grid key
 * goes there.
 *
 * THE REMOTE SLEEPS. Owner: "the player remote disappears until the cursor
 * goes down." A few seconds after the pointer last moved, the remote and
 * the row over the screen's head fade and the cursor goes with them; any
 * movement wakes them. A paused set stays awake, and so does a remote a
 * keyboard is on — a control that hides under the hand using it is a trap.
 *
 * SOUND follows the one shared preference every video surface in the city
 * reads (mediaState). Autoplay with sound is refused until the citizen has
 * touched the page; playWithSharedSound retries muted, and the speaker key
 * gives the sound back.
 *
 * No inline styles: the set is drawn in social.css.
 */

const videoOf = (p: Post | undefined) => p?.media?.find((m) => m.kind === 'video') ?? null;

export function CityTV({ items, startAt = 0, hasNextPage, fetchNextPage, onOpenChannel, onOpenChannels, head }: {
  items: Post[];
  /** What sits over the screen's head — the page's way back and its door to posting. Sleeps with the remote. */
  head?: ReactNode;
  /** Where the set is tuned when it comes on — a channel's first post, or a shuffle. */
  startAt?: number;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  onOpenChannel: (handle: string) => void;
  onOpenChannels: () => void;
}) {
  const qc = useQueryClient();
  const [at, setAt] = useState(() => Math.min(Math.max(0, startAt), Math.max(0, items.length - 1)));
  const [paused, setPaused] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => subscribeMuted(setMutedState), []);
  const screen = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t = 0;
    const wake = () => { setAwake(true); window.clearTimeout(t); t = window.setTimeout(() => setAwake(false), 2_800); };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => { window.clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  }, []);

  const post = items[at];
  const current = videoOf(post);
  const channels = useMemo(() => channelsOf(items), [items]);
  const channel = channels.find((c) => c.handle === post?.author?.handle) ?? null;

  /* THE NEXT PAGE ARRIVES BEFORE THE SET RUNS OUT. Three posts from the end
     of what is loaded, ask for more; the stream never stops on "that's
     everything" while there is more. */
  useEffect(() => {
    if (hasNextPage && fetchNextPage && items.length - at <= 3) fetchNextPage();
  }, [at, items.length, hasNextPage, fetchNextPage]);

  /* Onwards, and round again: past the last loaded video with no page left
     to load, the set starts over. A television does not go dark because the
     evening's programme ended. */
  const go = useCallback((step: 1 | -1) => {
    setAt((i) => {
      const n = i + step;
      if (!items.length) return 0;
      if (n < 0) return items.length - 1;
      if (n >= items.length) return hasNextPage ? i : 0;
      return n;
    });
  }, [items.length, hasNextPage]);

  /* A post with no video is not a frame. Skip it without drawing anything. */
  useEffect(() => {
    if (post && !current) go(1);
  }, [post, current, go]);

  const fullScreen = useCallback(() => {
    const el = screen.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  /* The video element follows the pause key, and plays with the shared
     sound preference whenever the post changes. */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (paused) { el.pause(); return; }
    playWithSharedSound(el);
    return () => { el.pause(); releasePlayback(el); };
  }, [paused, at, current?.url]);

  /* Keys a remote would have. Arrows move along the stream and the dial,
     space pauses, m mutes, f fills the screen. Ignored inside a field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => tuneIndex(items, i, -1)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => tuneIndex(items, i, 1)); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'm') setMuted(!isMuted());
      else if (e.key === 'f') fullScreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, items, fullScreen]);
  const tune = (step: 1 | -1) => setAt((i) => tuneIndex(items, i, step));

  if (!post || !current) return null;
  const caption = post.text?.trim() ?? '';
  const stale = () => onStaleMedia(qc, ['social']);

  return (
    <div className={awake || paused ? 'tv' : 'tv asleep'} ref={screen}>
      {head}
      <div className="tv-screen" aria-live="off">
        <video key={current.id} ref={video} className="tv-media" src={current.url} poster={current.thumbUrl ?? undefined}
          playsInline autoPlay muted={muted} onEnded={() => go(1)} onError={stale} />
        {captions && (caption || post.placeName) && (
          <div className="tv-caption">
            {caption && <p>{caption}</p>}
            {post.placeName && <p className="tv-caption-p"><Icon name="place" size={13} /> {post.placeName}</p>}
          </div>
        )}
      </div>

      {/* THE REMOTE, over the foot of the screen. */}
      <div className="tv-bar" role="toolbar" aria-label="Together City TV">
        <span className="tv-mark" aria-hidden><Icon name="tv" size={22} /></span>
        <div className="tv-keys">
          <button type="button" className="tv-key" onClick={() => go(-1)} aria-label="Previous video"><Icon name="skip-back" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
          <button type="button" className="tv-key" onClick={() => go(1)} aria-label="Next video"><Icon name="skip-next" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setCaptions((c) => !c)} aria-label={captions ? 'Hide the caption' : 'Show the caption'} aria-pressed={captions}><Icon name="captions" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setMuted(!isMuted())} aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'} aria-pressed={!muted}><Icon name={muted ? 'mute' : 'speak'} size={16} /></button>
          <button type="button" className="tv-key" onClick={fullScreen} aria-label="Full screen"><Icon name="expand" size={16} /></button>
          <button type="button" className="tv-key" onClick={onOpenChannels} aria-label="Together City Channels"><Icon name="grid" size={16} /></button>
        </div>
        {/* THE CHANNEL IS THE CITIZEN. Up and down tune; the face opens the
            profile, which is the channel's page. */}
        {channel && (
          <div className="tv-channel">
            <span className="tv-channel-l">Channel</span>
            <div className="tv-channel-row">
              <button type="button" className="tv-channel-btn" onClick={() => onOpenChannel(channel.handle)} aria-label={`Open ${channel.name}'s profile`}>
                <Avatar name={channel.name} src={channel.profileImage} />
                <span className="tv-channel-n">{channel.name}</span>
              </button>
              <div className="tv-dial">
                <button type="button" className="tv-key sm" onClick={() => tune(-1)} disabled={channels.length < 2} aria-label="Previous channel"><Icon name="up" size={14} /></button>
                <button type="button" className="tv-key sm" onClick={() => tune(1)} disabled={channels.length < 2} aria-label="Next channel"><Icon name="down" size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
