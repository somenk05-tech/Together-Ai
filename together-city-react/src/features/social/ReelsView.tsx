import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { isMuted, setMuted, subscribeMuted, claimPlayback, releasePlayback } from '@/lib/mediaState';
import { Avatar, savedIds, toggleSaved } from './PostCard';
import {
  useAddComment, useComments, useToggleLike, useRepost, type Post,
} from './api';

/*
 * ── THE FIVE MARKS ──────────────────────────────────────────────────────────
 *
 * The owner's reference sets them outlined, at one weight, in five hues, with
 * their words beside them. They draw at 24 in a 24 box and take their colour
 * from `currentColor`, which social.css sets per action — so the hue lives in
 * tokens.css where every other colour in the application lives, instead of
 * being typed into a stroke attribute here. That is a change of address for
 * `#ed4956` and `#22c55e`, which were the last two colours in this file.
 *
 * `fill` still varies: a like and a save are STATES, and the reference draws
 * its heart solid. Filling the mark is how this row says "you already did
 * this" without a second colour or a second word.
 */
const Ico = ({ children, fill = 'none' }: { children: ReactNode; fill?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <Ico fill={filled ? 'currentColor' : 'none'}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
  </Ico>
);
/* A circle with a tail, which is the reference's bubble — not the squared
   speech balloon the tab bars of five other apps use. */
const CommentIcon = () => (
  <Ico><circle cx="12.4" cy="10.9" r="8.1" /><path d="M7.2 17.4L4 21l4.6-1.3" /></Ico>
);
const SendIcon = () => (
  <Ico><path d="M21.5 2.5L10.8 13.2" /><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z" /></Ico>
);
const SaveIcon = ({ filled }: { filled: boolean }) => (
  <Ico fill={filled ? 'currentColor' : 'none'}>
    <path d="M18.5 21L12 16.3 5.5 21V4.8a1.8 1.8 0 0 1 1.8-1.8h9.4a1.8 1.8 0 0 1 1.8 1.8z" />
  </Ico>
);
/* Share is three points joined, not a second paper plane: sending a video to
   one person and putting it back into the city are different verbs, and the
   row has one mark for each. */
const ShareIcon = () => (
  <Ico>
    <circle cx="18" cy="5.2" r="2.8" /><circle cx="6" cy="12" r="2.8" /><circle cx="18" cy="18.8" r="2.8" />
    <path d="M8.5 10.6l7-3.9" /><path d="M8.5 13.4l7 3.9" />
  </Ico>
);
const ChevronIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 15l-6-6-6 6" /></svg>
);

// The sound preference lives in mediaState — ONE state for reels, the feed's
// autoplaying cards and the profile reader, so moving between surfaces never
// flips the citizen's choice. It still starts UNMUTED and still survives
// remounts; it just stopped being private to this file.

/**
 * THE VIDEO SHEET.
 *
 * One post per screen, snap-scrolled, as before. What changed on 29 Aug is
 * what a screen holds: the owner's reference is an editorial poster — the
 * author's name set large in the display serif, the caption in small sans
 * across from it, the picture under both, and five outlined marks with their
 * words along the foot. The rail of white glyphs stuck to the right edge of a
 * black rectangle is gone, and with it the phone/desktop fork this component
 * used to make in JavaScript: the sheet is one layout, and the phone reads it
 * through a media query in social.css like every other block in the city.
 */
export function ReelsView({ items, onOpenAuthor, hasNextPage, fetchNextPage, isFetchingNextPage, fullScreen, startAt }: {
  items: Post[];
  onOpenAuthor?: (handle: string) => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  fullScreen?: boolean;
  /** Open on this one. Tapping the fourth tile and landing on the first is the
   *  fastest way to make a viewer feel like it lost your place. */
  startAt?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  /**
   * Jump once, before paint, and without smooth scrolling.
   *
   * A smooth scroll through forty screens takes seconds and plays every video
   * it passes; `behavior: 'auto'` puts the viewer where they asked to be with
   * nothing in between. Once only — re-running it on every render would fight
   * the citizen's own thumb.
   */
  const jumped = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || jumped.current || !startAt) return;
    jumped.current = true;
    el.scrollTo({ top: startAt * el.clientHeight, behavior: 'auto' });
  }, [startAt]);
  // One mute state shared by every reel AND every other video surface.
  // Toggling re-renders the mounted reels (a tap, never a scroll frame).
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => subscribeMuted(setMutedState), []);
  const toggleMute = useCallback(() => setMuted(!isMuted()), []);
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.5) fetchNextPage();
  };
  const go = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight, behavior: 'smooth' });
  };
  return (
    <div className="sl-reel-root" style={{ height: fullScreen ? '100dvh' : 'calc(100dvh - 120px)' }}>
      <div ref={scroller} onScroll={onScroll} className="sl-reel-scroll tc-hscroll">
        {items.map((p, i) => <Reel key={p.key ?? p.id} post={p} onOpenAuthor={onOpenAuthor} muted={muted} onToggleMute={toggleMute} eager={Math.abs(i - (startAt ?? 0)) <= 1} />)}
        {isFetchingNextPage && <div className="sl-reel" aria-busy><Spinner /></div>}
      </div>
      {/* stepping between sheets, on a pointer that has no thumb */}
      <div className="sl-reel-nav">
        {([['up', -1], ['down', 1]] as const).map(([dir, d]) => (
          <button key={dir} type="button" onClick={() => go(d)} aria-label={dir === 'up' ? 'Previous' : 'Next'}
            className={`sl-reel-navbtn ${dir}`}><ChevronIcon /></button>
        ))}
      </div>
    </div>
  );
}

/* memo: appending a page of reels re-renders the list; the reels already
 * mounted have identical props and skip their render entirely — a scroll
 * that fetches page 3 does not re-run pages 1 and 2. */
const Reel = memo(function Reel({ post, onOpenAuthor, muted, onToggleMute, eager }: { post: Post; onOpenAuthor?: (handle: string) => void; muted: boolean; onToggleMute: () => void; eager?: boolean }) {
  const video = post.media.find((m) => m.kind === 'video');
  /**
   * Scroll mode is no longer only for videos, so it has to render what a post
   * actually is: a photo shows the photo, a text post shows the words. A
   * viewer that opens on a photograph and renders a black rectangle is worse
   * than not opening at all.
   */
  const photo = !video ? post.media.find((m) => m.kind === 'image') : undefined;
  const vref = useRef<HTMLVideoElement>(null);
  const aref = useRef<HTMLAudioElement>(null);
  const hasMusic = Boolean(post.musicUrl);
  // With a music track the video is silenced and the track carries the sound;
  // the (global) mute button then toggles the track. Sound is on by default.
  const [paused, setPaused] = useState(false);
  const like = useToggleLike();
  const repost = useRepost();
  const [reposted, setReposted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [saved, setSaved] = useState(() => savedIds().has(post.id));
  const toggleSave = () => setSaved(toggleSaved(post));
  // Preload the video BEFORE it reaches the screen so playback starts instantly
  // instead of buffering on arrival (the "lag"). The reel the viewer opened on
  // and its neighbours load at once; the rest flip true ~3 screens ahead.
  const [near, setNear] = useState(eager ?? false);

  // Keep the music track in lock-step with the video: play/pause/seek together.
  const syncAudioPlay = () => {
    const a = aref.current;
    if (!a) return;
    a.currentTime = (vref.current?.currentTime ?? 0) % (a.duration || 1e9);
    void a.play().catch(() => {});
  };
  const syncAudioPause = () => aref.current?.pause();

  useEffect(() => {
    const el = vref.current;
    if (!el) return;
    /**
     * THE LAG, AND WHERE IT ACTUALLY LIVED (owner, 24 Aug). A fast fling
     * outran the preload margin: the reel arrived before its `src` was
     * attached, `play()` rejected against an empty element, and nothing
     * retried when the bytes finally came — the screen just sat there until
     * a tap. Same cure as the feed cards: the wish to play is KEPT, and
     * honoured the moment the data arrives. Arrival also forces the src on,
     * so the warm-up observer can no longer be outrun.
     */
    let wants = false;
    const attempt = () => {
      if (!wants || !el.getAttribute('src')) return;
      // The claim pauses whichever video (reel or feed card) played before —
      // one video at a time, app-wide, without destroying anything.
      claimPlayback(el);
      void el.play().then(() => { setPaused(false); if (hasMusic) syncAudioPlay(); }).catch(() => {});
    };
    const onLoaded = () => attempt();
    el.addEventListener('loadeddata', onLoaded);
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        wants = true;
        setNear(true);
        attempt();
      } else { wants = false; el.pause(); releasePlayback(el); if (hasMusic) syncAudioPause(); }
    }, { threshold: [0, 0.5] });
    io.observe(el);
    return () => { io.disconnect(); el.removeEventListener('loadeddata', onLoaded); releasePlayback(el); syncAudioPause(); };
  }, [hasMusic]);

  // Warm the buffer ~1 screen before the reel scrolls into view.
  useEffect(() => {
    const el = vref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: '300% 0px 300% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // Once near, actively fetch the media (preload='auto' alone isn't always honored).
  useEffect(() => {
    const el = vref.current;
    if (near && el && el.networkState === el.NETWORK_EMPTY) el.load();
  }, [near]);

  const togglePlay = () => {
    const el = vref.current;
    if (!el) return;
    if (el.paused) { void el.play(); setPaused(false); if (hasMusic) syncAudioPlay(); }
    else { el.pause(); setPaused(true); if (hasMusic) syncAudioPause(); }
  };

  const shareCard: ShareCard = {
    kind: 'post', hub: 'Social',
    title: post.text?.trim() ? (post.text.length > 90 ? post.text.slice(0, 90) + '…' : post.text) : `${post.author.name}'s video`,
    subtitle: `by ${post.author.name}`,
    image: video?.thumbUrl ?? null,
    deepLink: '/social/feed',
  };

  /** One mark, one word, and the count only where there is one to say. */
  const act = (key: string, icon: ReactNode, label: string, onClick: () => void, count?: number) => (
    <button key={key} type="button" onClick={onClick} className={`sl-reel-act sl-reel-${key}`}>
      <span className="sl-reel-ic">{icon}</span>
      <span>{label}{count ? <span className="sl-reel-n"> {count}</span> : null}</span>
    </button>
  );

  return (
    <div className="sl-reel">
      <div className="sl-reel-sheet">
        <div className="sl-reel-head">
          <button type="button" className="sl-reel-who" onClick={() => onOpenAuthor?.(post.author.handle)}>
            {/* The full stop is the reference's, and it is the only colour
                above the picture. */}
            <span className="sl-reel-name">{post.author.name}<span className="sl-reel-dot">.</span></span>
            <span className="sl-reel-handle">@{post.author.handle}</span>
          </button>
          <div>
            {post.text && <p className="sl-reel-note">{post.text}</p>}
            {post.repostedBy && <div className="sl-reel-meta">Shared by {post.repostedBy.name}</div>}
            {/* The track and the sound toggle share one line at the caption's
                right edge. The toggle is HERE and not on the picture because
                the reference puts nothing on the picture — and because a
                control anchored to the stage floats in white space beside a
                portrait video, the stage being the full column and the video
                not. */}
            {(hasMusic || video) && (
              <div className="sl-reel-meta">
                {hasMusic && <span aria-hidden>♪</span>}
                {hasMusic && <span className="sl-reel-track">{post.musicTitle ?? 'Original audio'}</span>}
                <button type="button" onClick={onToggleMute} className="sl-reel-sound"
                  aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'}>
                  {muted ? '🔇' : '🔊'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="sl-reel-stage">
          {video && (
            /*
              THE SRC IS NOT SET UNTIL THE REEL IS NEAR.

              A `src` on every reel is a network request on every reel: forty
              posts in the feed opened forty connections the moment the viewer
              did, and the one video the citizen is actually looking at queued
              behind them. The poster still paints immediately, so a distant
              reel looks finished rather than empty — it simply has not asked
              for the bytes yet.
            */
            <video ref={vref} className="sl-reel-media" src={near ? video.url : undefined} poster={video.thumbUrl ?? undefined}
              muted={hasMusic ? true : muted} loop playsInline preload={near ? 'auto' : 'none'}
              onClick={togglePlay} />
          )}
          {photo && <img className="sl-reel-media" src={photo.url} alt="" loading="lazy" />}
          {!video && !photo && <p className="sl-reel-said">{post.text}</p>}
          {hasMusic && <audio ref={aref} src={post.musicUrl ?? undefined} loop muted={muted} preload="auto" />}

          {paused && video && (
            <span aria-hidden onClick={togglePlay} className="sl-reel-play">▶</span>
          )}
        </div>

        <div className="sl-reel-acts">
          {act('like', <HeartIcon filled={post.likedByMe} />, post.likedByMe ? 'Liked' : 'Like', () => like.mutate(post.id), post.likes)}
          {act('comment', <CommentIcon />, 'Comment', () => setCommentsOpen(true), post.comments)}
          {act('send', <SendIcon />, 'Send', () => setShareOpen(true))}
          {act('save', <SaveIcon filled={saved} />, saved ? 'Saved' : 'Save', toggleSave)}
          {act('share', <ShareIcon />, reposted ? 'Shared' : 'Share', () => { if (!reposted) repost.mutate(post.id, { onSuccess: () => setReposted(true) }); })}
        </div>
      </div>

      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
      {commentsOpen && <ReelComments postId={post.id} onClose={() => setCommentsOpen(false)} />}
    </div>
  );
});

/** Bottom-sheet comments for a reel. */
function ReelComments({ postId, onClose }: { postId: string; onClose: () => void }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate({ postId, text: text.trim() }, { onSuccess: () => setText('') });
  };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 5, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '70%', background: 'var(--card,#fff)', borderRadius: '16px 16px 0 0', padding: '14px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Comments</strong>
          <button type="button" onClick={onClose} aria-label="Close comments" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
        </div>
        {comments.isLoading && <Spinner />}
        {comments.isError && (
          <p className="muted" style={{ fontSize: 13 }}>Comments didn’t load — they’re still there. Try again in a moment.</p>
        )}
        {(comments.data ?? []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <Avatar name={c.author.name} src={c.author.profileImage} />
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.author.name}</span>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
            </div>
          </div>
        ))}
        {/* "Be the first to comment" on a failed read invited somebody to
            reply to a conversation that already exists. */}
        {!comments.isLoading && !comments.isError && (comments.data ?? []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>Be the first to comment.</p>}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--card,#fff)', paddingTop: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
          <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
        </form>
      </div>
    </div>
  );
}
