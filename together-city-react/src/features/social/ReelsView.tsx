import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { isMuted, setMuted, subscribeMuted, claimPlayback, releasePlayback } from '@/lib/mediaState';
import { CommentRow, savedIds, setSavedOwner, toggleSaved } from './PostCard';
import { ReportMenu } from './report';
import { useAuth } from '@/hooks/useAuth';
import { useDialog } from '@/hooks/useDialog';
import { HeartIcon, CommentIcon, SendIcon, SaveIcon, ShareIcon } from './marks';
import {
  useAddComment, useComments, useToggleLike, useRepost, type Post,
} from './api';

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
  const { user } = useAuth();
  const mine = Boolean(user && (user.id === post.author.id || user.handle === post.author.handle));
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
  setSavedOwner(user?.id);
  const [saved, setSaved] = useState(() => savedIds().has(post.id));
  const toggleSave = () => setSaved(toggleSaved(post));
  // Preload the video BEFORE it reaches the screen so playback starts instantly
  // instead of buffering on arrival (the "lag"). The reel the viewer opened on
  // and its neighbours load at once; the rest flip true ~3 screens ahead.
  const [near, setNear] = useState(eager ?? false);
  // Releasing the source is what actually frees the buffer: React setting
  // `src={undefined}` leaves the element's current source in place, so the
  // element has to be told.
  useEffect(() => {
    const el = vref.current;
    if (!near && el && el.getAttribute('src')) { el.removeAttribute('src'); el.load(); }
  }, [near]);

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

  /**
   * NEAR FLIPS BACK (30 Aug audit).
   *
   * It used to flip true once and never return, so every reel already scrolled
   * past kept its `src` attached with `preload="auto"`. Ten pages of the Videos
   * tab meant two hundred `<video>` elements holding two hundred buffers: on
   * mobile Safari that is a tab crash, not a slowdown. The comment on the src
   * below diagnosed exactly this problem and solved only its beginning — it
   * bounded when a video STARTS loading and nothing bounded the accumulation.
   *
   * The window is the same three screens either side that the warm-up already
   * used, so nothing about the scroll feels different; what changes is that
   * leaving the window releases the bytes.
   */
  useEffect(() => {
    const el = vref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setNear(entries[0].isIntersecting);
    }, { rootMargin: '300% 0px 300% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
    // The post, not the feed. "View Post →" used to open the recipient's own
    // feed, which is not this post and may not contain it (30 Aug audit).
    deepLink: `/social/p/${post.id}`,
  };

  /** One mark, one word, and the count only where there is one to say. */
  const act = (key: string, icon: ReactNode, label: string, onClick: () => void, count?: number) => (
    <button key={key} type="button" onClick={onClick} className={`sl-reel-act sl-mk-${key}`}>
      <span className="sl-mark">{icon}</span>
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
                {/* The sheet had no report control either — the audit's point
                    was that the gesture belongs on the thing, and a reel is a
                    thing. */}
                {!mine && <ReportMenu targetType="post" targetId={post.id} />}
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
              muted={hasMusic ? true : muted} loop playsInline preload={near ? 'auto' : 'none'} />
          )}
          {/* `alt=""` said this picture carries nothing, on a screen where the
              picture IS the post. There is no per-image description in the
              schema to read out, so the honest alt is who it is from — the
              same wording the feed card uses. */}
          {photo && <img className="sl-reel-media" src={photo.url} alt={`Photo shared by ${post.author.name}`} loading="lazy" />}
          {!video && !photo && <p className="sl-reel-said">{post.text}</p>}
          {/* Gated on `near` like the video beside it. Rendered unconditionally,
            forty reels with music opened forty audio connections at once —
            precisely the problem the note on the video's src describes. */}
        {hasMusic && <audio ref={aref} src={near ? (post.musicUrl ?? undefined) : undefined} loop muted={muted} preload={near ? 'auto' : 'none'} />}

          {/* PLAY/PAUSE IS A BUTTON, AND IT IS THERE EVEN WHILE PLAYING.
              It used to be a `<span aria-hidden onClick>` shown only when
              paused, over a `<video>` with no `controls` and its own onClick —
              which is to say the only way to pause a reel was to click the
              picture, and a keyboard or screen-reader user had no way at all
              (30 Aug audit). The control now covers the picture, carries the
              click the video used to carry, and names its state; the glyph
              inside it is still only drawn when the reel is stopped, so
              nothing sits on the picture while it plays. */}
          {video && (
            <button type="button" onClick={togglePlay} className="sl-reel-tap"
              aria-label={paused ? 'Play video' : 'Pause video'} aria-pressed={!paused}>
              {paused && <span aria-hidden className="sl-reel-play">▶</span>}
            </button>
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
      {commentsOpen && <ReelComments postId={post.id} canModerate={mine} onClose={() => setCommentsOpen(false)} />}
    </div>
  );
});

/** Bottom-sheet comments for a reel. */
function ReelComments({ postId, canModerate, onClose }: { postId: string; canModerate: boolean; onClose: () => void }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const { user } = useAuth();
  const myId = user?.id;
  const [text, setText] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);
  const sheet = useDialog(onClose);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSendErr(null);
    add.mutate({ postId, text: text.trim() }, {
      onSuccess: () => setText(''),
      // The reply used to stay in the box with nothing said, which reads as
      // "the button is broken" rather than "try that again".
      onError: () => setSendErr('That reply didn’t send — try again.'),
    });
  };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 5, display: 'flex', alignItems: 'flex-end' }}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="tc-reel-comments-title" tabIndex={-1}
        onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '70%', background: 'var(--card,#fff)', borderRadius: '16px 16px 0 0', padding: '14px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong id="tc-reel-comments-title" style={{ fontSize: 14 }}>Comments</strong>
          <button type="button" onClick={onClose} aria-label="Close comments" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
        </div>
        {comments.isLoading && <Spinner />}
        {comments.isError && (
          <p className="muted" style={{ fontSize: 13 }}>Comments didn’t load — they’re still there. Try again in a moment.</p>
        )}
        {(comments.data ?? []).map((c) => (
          <CommentRow key={c.id} comment={c} postId={postId} canRemove={canModerate || c.author.id === myId} />
        ))}
        {/* "Be the first to comment" on a failed read invited somebody to
            reply to a conversation that already exists. */}
        {!comments.isLoading && !comments.isError && (comments.data ?? []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>Be the first to comment.</p>}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--card,#fff)', paddingTop: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
          <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
        </form>
        {sendErr && <p role="alert" className="sl-fail-alert">{sendErr}</p>}
      </div>
    </div>
  );
}
