import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { isMuted, setMuted, subscribeMuted, playWithSharedSound, releasePlayback } from '@/lib/mediaState';
import { onStaleMedia } from '@/lib/remint';
import { Avatar } from './PostCard';
import type { Post } from './api';
import { channelsOf, tuneIndex, type Channel } from './city-tv';

/**
 * TOGETHER CITY TV — owner ask, 5 Sep: "create Together City TV here instead
 * of the city feed, and the channel takes them to the profile."
 *
 * One screen, one post at a time, playing on its own. A television, not a
 * wall: the citizen does not choose what to look at next, the city does, and
 * the controls are a remote — previous, pause, next, captions, sound, full
 * screen — under the screen where a remote's buttons are. The reference is a
 * TV set, so the chrome is a set's: a dark screen in a light room.
 *
 * A CHANNEL IS A CITIZEN. The dial on the right shows whose post is on; up
 * and down move to the next citizen with a post in the stream, and tapping
 * the channel opens that citizen's profile — the channel IS the person, and
 * the profile is the channel's page. Nothing on this screen is a second feed:
 * the stream is the For You lens the wall reads, in the same order, with the
 * same pages, so what plays here is exactly what the wall shows.
 *
 * WHAT PLAYS AND FOR HOW LONG. A video plays through and hands over when it
 * ends. A photograph holds for a few seconds; a post of several photographs
 * shows each in turn. A thought — a post with no media — is a title card in
 * the author's words, held the same way. Nothing is skipped: a feed that
 * played only the videos would be a channel that never shows most of what
 * the city posted.
 *
 * SOUND is the one shared preference every video surface in the city reads
 * (mediaState), so a set switched to mute stays mute on the reels and back.
 * Autoplay with sound is refused until the citizen has touched the page;
 * playWithSharedSound retries muted, and the speaker button gives it back.
 *
 * No inline styles: the set is drawn in social.css.
 */

/** How long a still or a title card holds before the next post. */
const HOLD_MS = 7_000;

export function CityTV({ items, hasNextPage, fetchNextPage, onOpenChannel }: {
  items: Post[];
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  onOpenChannel: (handle: string) => void;
}) {
  const qc = useQueryClient();
  const [at, setAt] = useState(0);
  const [frame, setFrame] = useState(0);        // which photograph of a many-photo post
  const [paused, setPaused] = useState(false);
  const [captions, setCaptions] = useState(true);
  // The screen, or the wall of channels the grid key opens (owner, 5 Sep:
  // "show channels like this but much sleeker and smaller").
  const [view, setView] = useState<'screen' | 'channels'>('screen');
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => subscribeMuted(setMutedState), []);
  const screen = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const post = items[at];
  const media = post?.media ?? [];
  const current = media[Math.min(frame, Math.max(0, media.length - 1))];
  const isVideo = current?.kind === 'video';
  const channels = useMemo(() => channelsOf(items), [items]);
  const channel = channels.find((c) => c.handle === post?.author?.handle) ?? null;

  /* THE NEXT PAGE ARRIVES BEFORE THE SET RUNS OUT. Three posts from the end
     of what is loaded, ask for more; the stream never stops on "that's
     everything" while there is more. */
  useEffect(() => {
    if (hasNextPage && fetchNextPage && items.length - at <= 3) fetchNextPage();
  }, [at, items.length, hasNextPage, fetchNextPage]);

  const go = useCallback((step: 1 | -1) => {
    setFrame(0);
    setAt((i) => {
      const n = i + step;
      if (n < 0) return 0;
      if (n >= items.length) return items.length ? items.length - 1 : 0;
      return n;
    });
  }, [items.length]);

  const fullScreen = useCallback(() => {
    const el = screen.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  /* The set is still while the channels are up: no clock runs and no video
     plays behind a wall the citizen is reading. */
  const still = paused || view !== 'screen';

  /* A photograph, a title card, or the next photograph of the same post:
     hold, then move on — unless the set is paused. A video moves on when it
     ends (below), never on a clock. */
  useEffect(() => {
    if (still || isVideo || !post) return;
    const t = window.setTimeout(() => {
      if (media.length > 1 && frame < media.length - 1) setFrame((f) => f + 1);
      else go(1);
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [still, isVideo, post, media.length, frame, go]);

  /* The video element follows the pause button, and plays with the shared
     sound preference whenever the post or the frame changes. */
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (still) { el.pause(); return; }
    playWithSharedSound(el);
    return () => { el.pause(); releasePlayback(el); };
  }, [still, at, frame, current?.url]);

  /* Keys a remote would have. Arrows move along the stream and the dial,
     space pauses, m mutes, f fills the screen. Ignored inside a field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFrame(0); setAt((i) => tuneIndex(items, i, -1)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFrame(0); setAt((i) => tuneIndex(items, i, 1)); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'm') setMuted(!isMuted());
      else if (e.key === 'f') fullScreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, items, fullScreen]);
  const tune = (step: 1 | -1) => { setFrame(0); setAt((i) => tuneIndex(items, i, step)); };
  const tuneTo = (c: Channel) => { setFrame(0); setAt(c.first); setPaused(false); setView('screen'); };
  /* SHUFFLE ALL: somewhere else in the stream, then onwards from there. The
     stream keeps its order — a shuffle that re-sorted it would make the
     previous key a lie. */
  const shuffle = () => { setFrame(0); setAt(Math.floor(Math.random() * items.length)); setPaused(false); setView('screen'); };

  if (!post) return null;
  const caption = post.text?.trim() ?? '';
  const stale = () => onStaleMedia(qc, ['social']);

  return (
    <div className="tv">
      {view === 'channels' && (
        /* THE CHANNELS. A wall of small square tiles — each citizen's newest
           picture with their name beneath in small caps — and Shuffle first.
           Sleeker and smaller than the reference on purpose: a tile is a
           button to tune, not a poster to admire. Tap one and the set tunes
           to that citizen; the remote's channel name still opens the profile. */
        <div className="tv-grid" role="list" aria-label="Channels">
          <button type="button" className="tv-tile tv-tile-shuffle" role="listitem" onClick={shuffle}>
            <span className="tv-tile-img"><Icon name="reorder" size={22} /></span>
            <span className="tv-tile-n">Shuffle all</span>
          </button>
          {channels.map((c) => (
            <button type="button" className={c.handle === channel?.handle ? 'tv-tile on' : 'tv-tile'} role="listitem" key={c.handle}
              onClick={() => tuneTo(c)} aria-label={`Tune to ${c.name}`} aria-current={c.handle === channel?.handle ? 'true' : undefined}>
              <span className="tv-tile-img">
                {c.tile ? <img src={c.tile} alt="" loading="lazy" onError={stale} /> : <Avatar name={c.name} src={c.profileImage} />}
              </span>
              <span className="tv-tile-n">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tv-set" hidden={view !== 'screen'}>
        <div className="tv-screen" ref={screen} aria-live="off">
          {current ? (
            isVideo ? (
              <video key={current.id} ref={video} className="tv-media" src={current.url} poster={current.thumbUrl ?? undefined}
                playsInline muted={muted} onEnded={() => go(1)} onError={stale} />
            ) : (
              <img key={current.id} className="tv-media" src={current.url} alt={caption || `A photograph by ${post.author.name}`} onError={stale} />
            )
          ) : (
            /* A THOUGHT IS A TITLE CARD. The citizen's own words, large, in
               their own voice — the one place on this screen the city says
               nothing of its own. */
            <div className="tv-card">
              <p className="tv-card-t">{caption || '…'}</p>
              <p className="tv-card-a">— {post.author.name}</p>
            </div>
          )}
          {captions && current && (caption || post.placeName) && (
            <div className="tv-caption">
              {caption && <p>{caption}</p>}
              {post.placeName && <p className="tv-caption-p"><Icon name="place" size={13} /> {post.placeName}</p>}
            </div>
          )}
          {media.length > 1 && (
            <div className="tv-frames" aria-hidden>
              {media.map((m, i) => <span key={m.id} className={i === frame ? 'on' : undefined} />)}
            </div>
          )}
        </div>
      </div>

      {/* THE REMOTE. */}
      <div className="tv-bar" role="toolbar" aria-label="Together City TV">
        <span className="tv-mark" aria-hidden><Icon name="tv" size={22} /></span>
        <div className="tv-keys">
          <button type="button" className="tv-key" onClick={() => go(-1)} disabled={at === 0} aria-label="Previous post"><Icon name="skip-back" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
          <button type="button" className="tv-key" onClick={() => go(1)} disabled={at >= items.length - 1 && !hasNextPage} aria-label="Next post"><Icon name="skip-next" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setCaptions((c) => !c)} aria-label={captions ? 'Hide the caption' : 'Show the caption'} aria-pressed={captions}><Icon name="captions" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setMuted(!isMuted())} aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'} aria-pressed={!muted}><Icon name={muted ? 'mute' : 'speak'} size={16} /></button>
          <button type="button" className="tv-key" onClick={fullScreen} aria-label="Full screen"><Icon name="expand" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setView((v) => (v === 'channels' ? 'screen' : 'channels'))}
            aria-label={view === 'channels' ? 'Back to the screen' : 'All channels'} aria-pressed={view === 'channels'}><Icon name="grid" size={16} /></button>
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
      <p className="tv-foot">
        {at + 1} of {items.length}{hasNextPage ? '+' : ''} · {channels.length} channel{channels.length === 1 ? '' : 's'} · ← → posts · ↑ ↓ channels · space pauses
      </p>
    </div>
  );
}
