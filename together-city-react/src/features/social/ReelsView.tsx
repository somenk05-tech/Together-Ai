import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Spinner } from '@/components/ui';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { Avatar } from './PostCard';
import {
  useAddComment, useComments, useToggleLike, useRepost, type Post,
} from './api';

/** Instagram-Reels-style vertical player for the Videos tab: one video per
 *  screen, snap-scroll up/down, autoplay in view, side action rail. */
export function ReelsView({ items, onOpenAuthor, hasNextPage, fetchNextPage, isFetchingNextPage }: {
  items: Post[];
  onOpenAuthor?: (handle: string) => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.5) fetchNextPage();
  };
  return (
    <div ref={scroller} onScroll={onScroll} className="tc-hscroll"
      style={{ height: 'min(760px, calc(100vh - 150px))', maxWidth: 440, margin: '0 auto',
        overflowY: 'auto', scrollSnapType: 'y mandatory', background: '#000', borderRadius: 16 }}>
      {items.map((p) => <Reel key={p.key ?? p.id} post={p} onOpenAuthor={onOpenAuthor} />)}
      {isFetchingNextPage && <div style={{ height: 60, display: 'grid', placeItems: 'center' }}><Spinner /></div>}
    </div>
  );
}

function Reel({ post, onOpenAuthor }: { post: Post; onOpenAuthor?: (handle: string) => void }) {
  const video = post.media.find((m) => m.kind === 'video');
  const vref = useRef<HTMLVideoElement>(null);
  const aref = useRef<HTMLAudioElement>(null);
  const hasMusic = Boolean(post.musicUrl);
  // With a music track, the video is silenced and the track carries the sound;
  // the mute button then toggles the track. Without a track it's the classic
  // muted-by-default reel.
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const like = useToggleLike();
  const repost = useRepost();
  const [reposted, setReposted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

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

  const railBtn = (icon: string, label: string | undefined, onClick: () => void) => (
    <button type="button" onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 24, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>
      <span>{icon}</span>
      {label !== undefined && <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>}
    </button>
  );

  return (
    <div style={{ height: '100%', scrollSnapAlign: 'start', position: 'relative', display: 'grid', placeItems: 'center', background: '#000', overflow: 'hidden' }}>
      {video && (
        <video ref={vref} src={video.url} poster={video.thumbUrl ?? undefined} muted={hasMusic ? true : muted} loop playsInline preload="metadata"
          onClick={togglePlay}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
      )}
      {hasMusic && <audio ref={aref} src={post.musicUrl ?? undefined} loop muted={muted} preload="auto" />}

      {/* play/pause hint */}
      {paused && (
        <span aria-hidden onClick={togglePlay} style={{ position: 'absolute', inset: 0, margin: 'auto', width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,.45)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 26, cursor: 'pointer' }}>▶</span>
      )}

      {/* mute toggle */}
      <button type="button" onClick={() => setMuted((m) => !m)}
        style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15 }}>
        {muted ? '🔇' : '🔊'}
      </button>

      {/* right action rail */}
      <div style={{ position: 'absolute', right: 10, bottom: 90, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
        {railBtn(post.likedByMe ? '❤️' : '🤍', String(post.likes), () => like.mutate(post.id))}
        {railBtn('💬', String(post.comments), () => setCommentsOpen(true))}
        {railBtn(reposted ? '🔁' : '🔁', reposted ? 'Shared' : 'Repost', () => { if (!reposted) repost.mutate(post.id, { onSuccess: () => setReposted(true) }); })}
        {railBtn('↗', 'Share', () => setShareOpen(true))}
      </div>

      {/* author + caption */}
      <div style={{ position: 'absolute', left: 12, right: 66, bottom: 16, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
        <button type="button" onClick={() => onOpenAuthor?.(post.author.handle)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={post.author.name} src={post.author.profileImage} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>@{post.author.handle}</span>
        </button>
        {post.repostedBy && <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.9 }}>🔁 Shared by {post.repostedBy.name}</div>}
        {post.text && <p style={{ fontSize: 13.5, lineHeight: 1.4, margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.text}</p>}
        {hasMusic && (
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.95 }}>
            <span style={{ display: 'inline-block', animation: 'spin 4s linear infinite' }}>🎵</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{post.musicTitle ?? 'Original audio'}</span>
          </div>
        )}
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
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
        </div>
        {comments.isLoading && <Spinner />}
        {(comments.data ?? []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <Avatar name={c.author.name} src={c.author.profileImage} />
            <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.author.name}</span>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
            </div>
          </div>
        ))}
        {!comments.isLoading && (comments.data ?? []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>Be the first to comment.</p>}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--card,#fff)', paddingTop: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
          <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
        </form>
      </div>
    </div>
  );
}
