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
 * over its foot — previous, pause, next, sound, full screen,
 * channels — and the dial on the right shows whose video is on. The set
 * plays on its own: one video through to its end, then the next, then the
 * next page of the stream, and when the stream runs out it starts again
 * from the top. Nobody scrolls a television.
 *
 * VIDEOS ONLY. The stream is the city-wide Videos lens, so every post here
 * carries a video; a post that somehow does not is skipped without a frame
 * drawn. No photograph, no title card.
 *
 * A CHANNEL IS A CITIZEN. The face on the remote is whose video is on;
 * tapping it opens the profile. (The up/down dial beside it went on 6 Sep —
 * owner: "the arrow keys, remove these two"; ↑ ↓ on a keyboard still tune,
 * and Together City Channels is one key away.) Tapping the channel opens the profile — the channel IS the
 * person. The channels wall is its own page (/social/channels); the grid key
 * goes there.
 *
 * THE REMOTE IS HIDDEN UNTIL TOUCHED. Owner, in three steps: "the remote
 * disappears until the cursor goes down"; "let the player vanish when the
 * video is playing"; "the remote only appears when someone clicks on the
 * video — until clicked it remains hidden." So: the set comes on with no
 * remote and no row over its head. A click or tap on the screen, or a key,
 * brings them up for two seconds; a moving mouse does not. A paused set stays awake, and so does a remote a
 * keyboard is on — a control that hides under the hand using it is a trap.
 *
 * SOUND follows the one shared preference every video surface in the city
 * reads (mediaState). Autoplay with sound is refused until the citizen has
 * touched the page; playWithSharedSound retries muted, and the speaker key
 * gives the sound back.
 *
 * WHAT THE AUDIT FOUND (5 Sep, evening), and what this file now does about
 * it. A video that never loads — an iPhone .mov Chrome cannot decode, a
 * 2 GB file on a slow line — held the screen forever: the set now shows the
 * poster with "tuning in" over it and moves on after a while, or at once on
 * an error. A video that ended while the next page was still on its way
 * froze the set on its last frame: it moves on the moment the page lands.
 * When the stream drops its oldest page (six pages are kept), the index
 * pointed twenty videos ahead: the set is anchored by the post's id. The
 * speaker key said "sound on" while the browser had refused autoplay with
 * sound and the element was in fact muted: the key reads the element, and a
 * "tap for sound" chip says what happened. Space on a focused key both
 * pressed the key and paused: the shortcuts step aside for a focused button.
 * The expand key never said it would also shrink: it does. And a thin line
 * along the foot of the screen says how far into the video the set is.
 *
 * WHAT'S NEXT (owner, 6 Sep): a key on the remote opens a list down the
 * right of the screen — the videos to come, in the order the set will
 * play them, each with its poster, its citizen and its first words; a tap
 * jumps the set there and closes the list — the citizen chose a video, so
 * the video is what they see (owner, 6 Sep). The list is what is loaded,
 * so it grows as pages arrive, and the set stays awake while it is open.
 *
 * No inline styles: the set is drawn in social.css.
 */

/** How long a video may sit at readyState 0 before the set moves on. */
const TUNE_MS = 12_000;
/** How long the remote stays after the hand goes still while a video plays. */
const SLEEP_MS = 2_000;
/** How long the set waits at the end of the stream for the next page. */
const PAGE_MS = 10_000;

/** The post's video, if the set can play it: a video still being made
 *  playable by the worker, or one that could not be, is not a broadcast. */
/** m:ss, or h:mm:ss past an hour — a post's video may be an hour long. */
export function clockText(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(r).padStart(2, '0')}`;
}

const videoOf = (p: Post | undefined) => p?.media?.find((m) => m.kind === 'video' && (m.state ?? 'ready') === 'ready') ?? null;

export function CityTV({ items, startAt = 0, hasNextPage, fetchNextPage, onOpenChannel, onOpenChannels, onLeave, head }: {
  items: Post[];
  /** What sits over the screen's head — the page's way back and its door to posting. Sleeps with the remote. */
  head?: ReactNode;
  /** Where the set is tuned when it comes on — a channel's first post, or a shuffle. */
  startAt?: number;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  onOpenChannel: (handle: string) => void;
  onOpenChannels: () => void;
  /** Escape, and the way back over the screen's head. */
  onLeave?: () => void;
}) {
  const qc = useQueryClient();
  const [at, setAt] = useState(() => Math.min(Math.max(0, startAt), Math.max(0, items.length - 1)));
  const [paused, setPaused] = useState(false);
  // WHAT'S NEXT (owner, 6 Sep): a list down the right of the screen of the
  // videos to come, in the order the set will play them; a tap jumps there.
  const [queue, setQueue] = useState(false);
  // THE VOLUME (owner, 6 Sep: "the volume button should increase or
  // decrease"). The speaker key opens a small slider; 0 is mute. On an
  // iPhone the element's volume is the phone's and cannot be set from a page
  // — the slider still shows, and the mute half still works.
  const [volume, setVolume] = useState(1);
  const [vol, setVol] = useState(false);
  // ROTATE (owner, 6 Sep): a wide video on a tall phone is a strip across
  // the middle; turned a quarter it fills the screen. A key on the remote
  // turns it and turns it back; the set turns it back itself on the next video.
  const [rotated, setRotated] = useState(false);
  // THE SLIDER (owner, 6 Sep): where the video is and how long it is, and a
  // slider to move it. Read off the element four times a second.
  const [clock, setClock] = useState({ time: 0, duration: 0 });
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => subscribeMuted(setMutedState), []);
  const screen = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // HIDDEN UNTIL TOUCHED (owner, 6 Sep: "the remote only appears when
  // someone clicks on the video; until clicked it remains hidden"). The set
  // comes on with no remote; a click or tap on the screen, or a key, brings
  // it up for two seconds. A moving mouse does not — a television is
  // watched, not hovered.
  const [awake, setAwake] = useState(false);
  const sleepTimer = useRef(0);
  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(sleepTimer.current);
    sleepTimer.current = window.setTimeout(() => setAwake(false), SLEEP_MS);
  }, []);
  useEffect(() => {
    // Every way a hand can announce itself: a mouse, a pen, a finger, a key,
    // a wheel. One of them not firing is a citizen who cannot find the door.
    const EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;
    for (const e of EVENTS) window.addEventListener(e, wake, { passive: true });
    return () => { window.clearTimeout(sleepTimer.current); for (const e of EVENTS) window.removeEventListener(e, wake); };
  }, [wake]);
  /* What the ELEMENT is doing, as opposed to what the set asked of it: a
     browser that refused autoplay with sound leaves the element muted; a file
     the browser cannot read never reaches its metadata. */
  const [elMuted, setElMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const post = items[at];
  const current = videoOf(post);
  /* ANCHORED BY ID. The stream keeps six pages and drops the oldest, so an
     index into it moves twenty places when page seven arrives. The post on
     screen is found again by its id whenever the stream changes. */
  const onScreen = useRef<string | undefined>(undefined);
  onScreen.current = post?.id;
  useEffect(() => {
    const id = onScreen.current;
    if (!id) return;
    const idx = items.findIndex((p) => p.id === id);
    if (idx >= 0) setAt((i) => (i === idx ? i : idx));
  }, [items]);
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
  const waiting = useRef(false);
  const go = useCallback((step: 1 | -1) => {
    setAt((i) => {
      const n = i + step;
      if (!items.length) return 0;
      if (n < 0) return items.length - 1;
      if (n >= items.length) {
        // The next page is on its way: hold here, and move the moment it
        // lands (below). Nothing on its way: round to the top.
        if (hasNextPage) { waiting.current = true; return i; }
        return 0;
      }
      return n;
    });
  }, [items.length, hasNextPage]);
  useEffect(() => {
    if (!waiting.current) return;
    if (at < items.length - 1) { waiting.current = false; setAt(at + 1); return; }
    // A page that never comes — a lost connection, a request that failed —
    // must not be a dark screen: after a while, round to the top.
    const t = window.setTimeout(() => { if (waiting.current) { waiting.current = false; setAt(0); } }, PAGE_MS);
    return () => window.clearTimeout(t);
  }, [items.length, at]);

  /* TUNING IN. A video that reaches no metadata in TUNE_MS — a format this
     browser cannot decode, a file too far away — is not a broadcast; move on.
     An error moves on at once, after asking the feed to re-mint its links. */
  const currentId = current?.id;
  useEffect(() => {
    setReady(false);
    setElMuted(false);
    setRotated(false);
    setClock({ time: 0, duration: 0 });
    screen.current?.style.setProperty('--tv-progress', '0');
  }, [currentId]);
  useEffect(() => {
    if (!currentId || ready || paused) return;
    const t = window.setTimeout(() => go(1), TUNE_MS);
    return () => window.clearTimeout(t);
  }, [currentId, ready, paused, go]);

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
    el.volume = volume;
    playWithSharedSound(el);
    return () => { el.pause(); releasePlayback(el); };
  }, [paused, at, current?.url, volume]);

  /* Keys a remote would have. Arrows move along the stream and the dial,
     space pauses, m mutes, f fills the screen. Ignored inside a field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // A focused key on the remote is pressed by space and enter; the
      // shortcuts must not press pause under it.
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.key === 'Escape' && !document.fullscreenElement) { onLeave?.(); return; }
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
  }, [go, items, fullScreen, onLeave]);

  /* The videos to come, in play order: after this one to the end of what is
     loaded, then — with nothing more to load — round from the top. */
  const upNext = useMemo(() => {
    const rest = items.map((p, index) => ({ post: p, index })).filter((e) => e.index !== at && videoOf(e.post));
    const after = rest.filter((e) => e.index > at);
    const before = hasNextPage ? [] : rest.filter((e) => e.index < at);
    return [...after, ...before].slice(0, 40);
  }, [items, at, hasNextPage]);

  if (!post || !current) return null;
  const caption = post.text?.trim() ?? '';
  const stale = () => onStaleMedia(qc, ['social']);

  return (
    <div className={awake || paused || queue || vol ? 'tv' : 'tv asleep'} ref={screen}>
      {head}
      <div className={rotated ? 'tv-screen rotated' : 'tv-screen'} aria-live="off">
        <video key={current.id} ref={video} className="tv-media" src={current.url} poster={current.thumbUrl ?? undefined}
          playsInline autoPlay muted={muted} preload="auto"
          onLoadedMetadata={(e) => { setReady(true); setClock({ time: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0 }); }}
          onDurationChange={(e) => {
            // Read the element NOW: inside a state updater the event's
            // currentTarget is already null (Safari, 6 Sep: a crashed page).
            const duration = e.currentTarget.duration || 0;
            setClock((c) => ({ ...c, duration }));
          }}
          onVolumeChange={(e) => setElMuted(e.currentTarget.muted)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const p = el.duration > 0 ? el.currentTime / el.duration : 0;
            screen.current?.style.setProperty('--tv-progress', String(p));
            setClock({ time: el.currentTime, duration: el.duration || 0 });
          }}
          onEnded={() => go(1)} onError={() => { stale(); go(1); }} />
        {!ready && !paused && (
          <div className="tv-tuning" role="status" aria-live="polite"><span className="tv-tuning-dot" aria-hidden />Tuning in…</div>
        )}
        {elMuted && !muted && ready && (
          /* The browser refused autoplay with sound and the set is playing
             muted; the citizen asked for sound, so say it and give it back. */
          <button type="button" className="tv-sound" onClick={() => { setMuted(false); const el = video.current; if (el) { el.muted = false; void el.play().catch(() => {}); } }}>
            <Icon name="speak" size={15} /> Tap for sound
          </button>
        )}
        <div className="tv-progress" aria-hidden><span /></div>
        {(caption || post.placeName) && (
          <div className="tv-caption">
            {caption && <p>{caption}</p>}
            {post.placeName && <p className="tv-caption-p"><Icon name="place" size={13} /> {post.placeName}</p>}
          </div>
        )}
      </div>

      {queue && (
        <aside id="tv-next" className="tv-next" aria-label="What's next">
          <div className="tv-next-h">
            <span>What's next</span>
            <button type="button" className="tv-key sm" onClick={() => setQueue(false)} aria-label="Hide what is next"><Icon name="close" size={14} /></button>
          </div>
          <ol className="tv-next-l">
            {upNext.map(({ post: p, index }) => {
              const v = videoOf(p)!;
              return (
                <li key={p.id}>
                  <button type="button" className="tv-next-i" onClick={() => { setAt(index); setPaused(false); setQueue(false); }}>
                    <span className="tv-next-p">{v.thumbUrl ? <img src={v.thumbUrl} alt="" loading="lazy" onError={stale} /> : <Icon name="video" size={18} />}</span>
                    <span className="tv-next-t">
                      <span className="tv-next-n">{p.author.name}</span>
                      <span className="tv-next-c">{p.text?.trim() || 'A video'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {upNext.length === 0 && <li className="tv-next-e">{hasNextPage ? 'More on its way…' : 'Back to the top after this.'}</li>}
          </ol>
        </aside>
      )}

      {vol && (
        <div id="tv-vol" className="tv-vol" role="group" aria-label="Volume">
          <button type="button" className="tv-key sm" aria-label={muted || elMuted ? 'Turn the sound on' : 'Turn the sound off'} aria-pressed={!(muted || elMuted)}
            onClick={() => { const on = muted || elMuted; setMuted(!on); const el = video.current; if (el) { el.muted = !on; if (on) void el.play().catch(() => {}); } }}>
            <Icon name={muted || elMuted ? 'mute' : 'speak'} size={14} />
          </button>
          <input type="range" className="tv-vol-r" min={0} max={100} step={1} value={Math.round(volume * 100)} aria-label="Volume level"
            onChange={(e) => {
              const v = Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100));
              setVolume(v);
              const el = video.current;
              if (el) { el.volume = v; if (v > 0 && el.muted) { el.muted = false; setMuted(false); } }
            }} />
          <span className="tv-vol-t">{Math.round(volume * 100)}</span>
        </div>
      )}

      {/* THE REMOTE, over the foot of the screen: the slider along its top —
          where the video is, and how long it is — and the keys beneath. */}
      <div className="tv-bar" role="toolbar" aria-label="Together City TV">
        <div className="tv-seek">
          <span className="tv-seek-t">{clockText(clock.time)}</span>
          <input type="range" className="tv-scrub" min={0} max={clock.duration || 0} step={0.1} value={Math.min(clock.time, clock.duration || 0)}
            disabled={!clock.duration} aria-label="Move through the video" aria-valuetext={`${clockText(clock.time)} of ${clockText(clock.duration)}`}
            onChange={(e) => { const el = video.current; const t = Number(e.currentTarget.value); if (el && Number.isFinite(t)) el.currentTime = t; setClock((c) => ({ ...c, time: t })); }} />
          <span className="tv-seek-t">{clockText(clock.duration)}</span>
        </div>
        <div className="tv-bar-row">
        {/* THE TV GLYPH IS GONE (owner, 6 Sep). It was a 44px decorative mark
            at the head of the keys — a picture of a television, on a
            television — and on a phone it took a whole line of the remote to
            say what the citizen was already looking at. */}
        <div className="tv-keys">
          <button type="button" className="tv-key" onClick={() => go(-1)} aria-label="Previous video"><Icon name="skip-back" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
          <button type="button" className="tv-key" onClick={() => go(1)} aria-label="Next video"><Icon name="skip-next" size={16} /></button>
          {/* AND THE CAPTION KEY WITH IT (owner, 6 Sep). It toggled the poster's
              own words on and off; they are on, which is what it defaulted to
              and what nearly nobody changed. One key fewer is one row on a
              phone. */}
          <button type="button" className="tv-key" onClick={() => setVol((v) => !v)} aria-label="Volume" aria-pressed={vol} aria-expanded={vol} aria-controls="tv-vol"><Icon name={muted || elMuted || volume === 0 ? 'mute' : 'speak'} size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setRotated((r) => !r)} aria-label={rotated ? 'Turn the video back' : 'Turn the video upright'} aria-pressed={rotated}><Icon name="rotate" size={16} /></button>
          <button type="button" className="tv-key" onClick={fullScreen} aria-label={fs ? 'Leave full screen' : 'Full screen'} aria-pressed={fs}><Icon name="expand" size={16} /></button>
          <button type="button" className="tv-key" onClick={onOpenChannels} aria-label="Together City Channels"><Icon name="grid" size={16} /></button>
          <button type="button" className="tv-key" onClick={() => setQueue((q) => !q)} aria-label={queue ? 'Hide what is next' : "What's next"} aria-pressed={queue} aria-controls="tv-next" aria-expanded={queue}><Icon name="queue" size={16} /></button>
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
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
