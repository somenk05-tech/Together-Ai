import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { Avatar, savedIds, toggleSaved } from './PostCard';
import {
  useAddComment, useComments, useToggleLike, useRepost, type Post,
} from './api';

// Instagram-web style dark outline icons drawn on the white page beside the video.
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill={filled ? '#ed4956' : 'none'} stroke={filled ? '#ed4956' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);
const CommentIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
const RepostIcon = ({ on }: { on: boolean }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={on ? '#22c55e' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const ShareIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);
const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

// Global sound preference for reels — starts UNMUTED (sound on) and a single
// mute/unmute applies to every video and persists across scrolling and remounts
// for the session. Module-level so it survives component remounts.
let sharedMuted = false;

/** Instagram-Reels-style vertical player for the Videos tab: one video per
 *  screen, snap-scroll up/down, autoplay in view, side action rail. */
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
  // One mute state shared by every reel. Toggling it here re-renders all reels.
  const [muted, setMuted] = useState(sharedMuted);
  const toggleMute = () => setMuted((m) => { sharedMuted = !m; return !m; });
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
    <div style={{ position: 'relative', height: fullScreen ? '100dvh' : 'calc(100dvh - 120px)', background: 'var(--card)' }}>
      <div ref={scroller} onScroll={onScroll} className="tc-hscroll"
        style={{ height: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory' }}>
        {items.map((p) => <Reel key={p.key ?? p.id} post={p} onOpenAuthor={onOpenAuthor} muted={muted} onToggleMute={toggleMute} />)}
        {isFetchingNextPage && <div style={{ height: 60, display: 'grid', placeItems: 'center' }}><Spinner /></div>}
      </div>
      {/* Instagram-web up/down navigation on the far right */}
      <div style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {([['up', -1], ['down', 1]] as const).map(([dir, d]) => (
          <button key={dir} type="button" onClick={() => go(d)} aria-label={dir === 'up' ? 'Previous' : 'Next'}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--line)', cursor: 'pointer',
              display: 'grid', placeItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.08)', color: 'var(--ink)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: dir === 'down' ? 'rotate(180deg)' : 'none' }}><path d="M18 15l-6-6-6 6" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function Reel({ post, onOpenAuthor, muted, onToggleMute }: { post: Post; onOpenAuthor?: (handle: string) => void; muted: boolean; onToggleMute: () => void }) {
  // Phone: the reel IS the screen — 9:16 full-bleed like every reels player.
  // The action rail and caption move ONTO the video in white; desktop keeps
  // the white-page card with the rail beside it. Mount-time matchMedia, the
  // same pattern the sign-in backdrop and the poster walk use.
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
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
  // instead of buffering on arrival (the "lag"). Flips true ~1 screen ahead.
  const [near, setNear] = useState(false);

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
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        void el.play().then(() => { setPaused(false); if (hasMusic) syncAudioPlay(); }).catch(() => {});
      } else { el.pause(); if (hasMusic) syncAudioPause(); }
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => { io.disconnect(); syncAudioPause(); };
  }, [hasMusic]);

  // Warm the buffer ~1 screen before the reel scrolls into view.
  useEffect(() => {
    const el = vref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: '120% 0px 120% 0px', threshold: 0 });
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

  const railBtn = (icon: ReactNode, label: string | undefined, onClick: () => void, key: string) => (
    <button key={key} type="button" onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: phone ? '#fff' : 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28 }}>{icon}</span>
      {label !== undefined && <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>}
    </button>
  );

  return (
    <div style={{ height: '100%', scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* video card — sizes to the video's OWN aspect ratio (no letterboxing);
          capped by max height/width so it always fits the screen with room for
          the side rail and nav arrows. */}
      <div style={phone
        ? { position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden', lineHeight: 0, display: 'grid', placeItems: 'center' }
        : { position: 'relative', width: 'fit-content', height: 'fit-content', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', background: '#000', borderRadius: 14, overflow: 'hidden', lineHeight: 0 }}>
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
          <video ref={vref} src={near ? video.url : undefined} poster={video.thumbUrl ?? undefined}
            muted={hasMusic ? true : muted} loop playsInline preload={near ? 'auto' : 'none'}
            onClick={togglePlay}
            style={phone
              ? { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }
              : { display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', minWidth: 260, minHeight: 200, background: 'var(--media-bg)' }} />
        )}
        {photo && (
          <img src={photo.url} alt="" loading="lazy"
            style={phone
              ? { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }
              : { display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)' }} />
        )}
        {!video && !photo && (
          /* A text post still deserves a screen of its own rather than being
             skipped, or scroll mode would silently drop posts from the feed
             it was opened out of. */
          <div style={{ display: 'grid', placeItems: 'center', width: 'min(560px, 80vw)', minHeight: 320, padding: 28, background: 'var(--card)' }}>
            <p style={{ fontSize: 20, lineHeight: 1.45, textAlign: 'center', margin: 0, color: 'var(--ink)' }}>{post.text}</p>
          </div>
        )}
        {hasMusic && <audio ref={aref} src={post.musicUrl ?? undefined} loop muted={muted} preload="auto" />}

        {paused && (
          <span aria-hidden onClick={togglePlay} style={{ position: 'absolute', inset: 0, margin: 'auto', width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,.45)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 26, cursor: 'pointer' }}>▶</span>
        )}

        {/* mute toggle (bottom-right of the video) — one control for ALL reels */}
        <button type="button" onClick={onToggleMute}
          style={{ minWidth: 44, minHeight: 44, position: 'absolute', bottom: 12, right: 12, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15 }}>
          {muted ? '🔇' : '🔊'}
        </button>

        {/* action rail — OUTSIDE the video, to its right (Instagram web) */}
        <div style={phone
          ? { position: 'absolute', right: 10, bottom: 96, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }
          : { position: 'absolute', left: '100%', bottom: 4, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          {railBtn(<HeartIcon filled={post.likedByMe} />, String(post.likes), () => like.mutate(post.id), 'like')}
          {railBtn(<CommentIcon />, String(post.comments), () => setCommentsOpen(true), 'comment')}
          {railBtn(<RepostIcon on={reposted} />, reposted ? 'Shared' : 'Repost', () => { if (!reposted) repost.mutate(post.id, { onSuccess: () => setReposted(true) }); }, 'repost')}
          {railBtn(<ShareIcon />, 'Share', () => setShareOpen(true), 'share')}
          {railBtn(<BookmarkIcon filled={saved} />, undefined, toggleSave, 'save')}
        </div>

        {/* author + caption — BELOW the video, left aligned (Instagram web) */}
        <div style={phone
          ? { position: 'absolute', left: 12, right: 64, bottom: 14, color: '#fff' }
          : { position: 'absolute', top: '100%', left: 0, marginTop: 12, width: '100%', color: 'var(--ink)' }}>
          <button type="button" onClick={() => onOpenAuthor?.(post.author.handle)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: phone ? '#fff' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={post.author.name} src={post.author.profileImage} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{post.author.handle}</span>
          </button>
          {post.repostedBy && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>🔁 Shared by {post.repostedBy.name}</div>}
          {post.text && <p style={{ fontSize: 13.5, lineHeight: 1.4, margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.text}</p>}
          {hasMusic && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', animation: 'spin 4s linear infinite' }}>🎵</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{post.musicTitle ?? 'Original audio'}</span>
            </div>
          )}
        </div>
      </div>

      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
      {commentsOpen && <ReelComments postId={post.id} onClose={() => setCommentsOpen(false)} />}
    </div>
  );
}

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
            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
          <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
        </form>
      </div>
    </div>
  );
}
