import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import {
  useAddComment, useComments, useToggleLike, useDeletePost, useUpdatePost, useRepost, type Post, type PostMedia,
} from './api';

export function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

export function Avatar({ name, src }: { name: string; src?: string | null }) {
  if (src) return <img src={src} alt={name} width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div className="tc-avatar" style={{
      width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
      background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 14, flexShrink: 0,
    }}>
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

const AUD_EMOJI: Record<string, string> = { public: '🌍', friends: '👥', family: '👨‍👩‍👧', private: '🔒' };

/** 🔖 Saved posts — lightweight local bookmarks (persisted on this device). */
const SAVED_KEY = 'tc-saved-posts';
export function savedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function toggleSaved(post: Post): boolean {
  const ids = savedIds();
  const on = !ids.has(post.id);
  if (on) ids.add(post.id); else ids.delete(post.id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
    const snaps = JSON.parse(localStorage.getItem(SAVED_KEY + '-data') ?? '{}') as Record<string, unknown>;
    if (on) snaps[post.id] = post; else delete snaps[post.id];
    localStorage.setItem(SAVED_KEY + '-data', JSON.stringify(snaps));
  } catch { /* storage full — ignore */ }
  return on;
}

function CommentsPanel({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add.mutate({ postId, text: text.trim() }, { onSuccess: () => setText('') });
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      {comments.isLoading && <Spinner />}
      {(comments.data ?? []).map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <Avatar name={c.author.name} src={c.author.profileImage} />
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.author.name}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{timeAgo(c.createdAt)}</span>
            <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
          </div>
        </div>
      ))}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
        <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
      </form>
    </div>
  );
}

/** A single feed image. When it's the only image, the frame adapts to the
 *  photo's orientation (16:9 landscape or 9:16 vertical); in a grid it stays 16:9. */
function ImgCell({ url, adaptive, overlay, alt }: { url: string; adaptive: boolean; overlay?: ReactNode; alt: string }) {
  // Frame to the image's TRUE aspect ratio (any ratio) — nothing is cropped.
  // `contain` guarantees the whole image shows; a tall/wide image just gets a
  // taller/wider frame (capped so it never dominates the screen).
  const [ar, setAr] = useState(16 / 9); // width / height
  const shown = adaptive ? ar : 16 / 9;
  return (
    <div style={{ position: 'relative', aspectRatio: String(shown), maxHeight: adaptive ? 720 : undefined, background: '#000' }}>
      <img src={url} alt={alt} onLoad={(e) => { if (adaptive) setAr(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight)); }}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      {overlay}
    </div>
  );
}

/** Multiple images as a horizontal swipe/scroll carousel — every image is
 *  reachable (no more +N cutoff), with dot indicators and a counter. */
function ImageCarousel({ images, authorName }: { images: PostMedia[]; authorName: string }) {
  const [idx, setIdx] = useState(0);
  const [ar, setAr] = useState(16 / 9); // true shape from the first image (any ratio)
  const shown = ar;
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <div ref={ref} onScroll={onScroll} className="tc-hscroll"
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', borderRadius: 14, scrollbarWidth: 'none', aspectRatio: String(shown), maxHeight: 640, background: '#000' }}>
        {images.map((m, i) => (
          <div key={m.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', height: '100%' }}>
            {/* contain, so portrait photos are never cropped (letterboxed if the
                slide's shape differs) */}
            <img src={m.url} alt={`Photo shared by ${authorName}`} loading="lazy"
              onLoad={i === 0 ? (e) => setAr(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight)) : undefined}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, pointerEvents: 'none' }}>
        {idx + 1} / {images.length}
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
        {images.map((m, i) => (
          <span key={m.id} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? '#fff' : 'rgba(255,255,255,.5)' }} />
        ))}
      </div>
    </div>
  );
}

/** A feed video framed 16:9 (landscape) or 9:16 (vertical) by its real dimensions.
 *  `autoInView` makes it autoplay (muted) while scrolled into view and pause when
 *  it leaves — used by the "Videos" feed section. */
function VideoFrame({ url, isNew, vref, autoInView }: { url: string; isNew: boolean; vref?: Ref<HTMLVideoElement>; autoInView?: boolean }) {
  const [ar, setAr] = useState(16 / 9); // real width / height
  const localRef = useRef<HTMLVideoElement | null>(null);
  const setRefs = useCallback((el: HTMLVideoElement | null) => {
    localRef.current = el;
    if (typeof vref === 'function') vref(el);
    else if (vref) (vref as MutableRefObject<HTMLVideoElement | null>).current = el;
  }, [vref]);
  useEffect(() => {
    if (!autoInView) return;
    const el = localRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.6) { el.muted = true; void el.play().catch(() => {}); }
      else el.pause();
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, [autoInView]);
  return (
    <video ref={setRefs} src={url} controls playsInline autoPlay={isNew} muted={isNew || autoInView} loop={isNew || autoInView}
      onLoadedMetadata={(e) => setAr((e.currentTarget.videoWidth || 16) / Math.max(1, e.currentTarget.videoHeight || 9))}
      style={{ width: '100%', aspectRatio: String(ar), maxHeight: 720, objectFit: 'contain', borderRadius: 14, marginTop: 12, background: '#000', display: 'block' }} />
  );
}

/** One clean card for every kind of post — photo, video, check-in, text.
 *  `isNew` marks a just-posted item (a "New" chip, "Just now", auto-playing video).
 *  `manage` shows the author's Edit/Delete menu (used on the profile, not the feed).
 *  `onOpenAuthor` opens the author's profile (the parent owns the modal, so this
 *  component has no dependency on the profile page — avoids a circular import). */
export function PostCard({ post, isNew = false, manage = false, onOpenAuthor, onSetCover, coverBusy = false, autoplayVideo = false }: {
  post: Post; isNew?: boolean; manage?: boolean; onOpenAuthor?: (handle: string) => void;
  onSetCover?: (timeSec: number) => void; coverBusy?: boolean; autoplayVideo?: boolean;
}) {
  const like = useToggleLike();
  const del = useDeletePost();
  const upd = useUpdatePost();
  const repost = useRepost();
  const [reposted, setReposted] = useState(false);
  const { user } = useAuth();
  const vidRef = useRef<HTMLVideoElement>(null);
  const isMine = Boolean(user && (user.id === post.author.id || user.handle === post.author.handle));
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text ?? '');
  const [showComments, setShowComments] = useState(false);
  const [saved, setSaved] = useState(() => savedIds().has(post.id));
  const [shareOpen, setShareOpen] = useState(false);
  const actionStyle = (on = false): CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit',
    color: on ? 'var(--accent)' : 'var(--muted)', fontWeight: on ? 700 : 400, padding: 0,
  });

  const images = post.media.filter((m) => m.kind === 'image');
  const videos = post.media.filter((m) => m.kind === 'video');
  const aud = post.audience && post.audience !== 'public' ? AUD_EMOJI[post.audience] : null;

  const shareCard: ShareCard = {
    kind: 'post',
    hub: 'Social',
    title: post.text?.trim() ? (post.text.length > 90 ? post.text.slice(0, 90) + '…' : post.text) : `${post.author.name}'s post`,
    subtitle: `by ${post.author.name}${post.placeName ? ` · 📍 ${post.placeName}` : ''}`,
    image: images[0]?.url ?? videos[0]?.thumbUrl ?? null,
    deepLink: '/social/feed',
  };

  const openAuthor = () => onOpenAuthor?.(post.author.handle);

  return (
    <article className="card" style={{ marginBottom: 16, ...(isNew ? { boxShadow: '0 0 0 2px var(--accent)', animation: 'tc-pop .3s ease-out' } : {}) }}>
      {post.repostedBy && (
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          🔁 Shared by {post.repostedBy.name} <span style={{ fontWeight: 400 }}>@{post.repostedBy.handle}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={openAuthor} aria-label={`View ${post.author.name}'s profile`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenAuthor ? 'pointer' : 'default', flexShrink: 0 }}>
          <Avatar name={post.author.name} src={post.author.profileImage} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            <button type="button" onClick={openAuthor}
              style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenAuthor ? 'pointer' : 'default', font: 'inherit', fontWeight: 600, color: 'inherit' }}>
              {post.author.name}
            </button>
            <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> @{post.author.handle}</span>
            {aud && <span title={post.audience} style={{ fontSize: 12, marginLeft: 6 }}>{aud}</span>}
            {isNew && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '2px 8px', marginLeft: 8 }}>New</span>}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {isNew ? 'Just now' : `${timeAgo(post.createdAt)} ago`}
            {post.feeling ? ` · feeling ${post.feeling}` : ''}
          </div>
          {post.placeName && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 }}>📍 {post.placeName}</div>
          )}
        </div>
        {manage && isMine && (
          <div style={{ position: 'relative', flex: 'none' }}>
            <button type="button" aria-label="Post options" onClick={() => setMenuOpen((o) => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--muted)', padding: '2px 6px' }}>⋯</button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 21, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,.16)', overflow: 'hidden', minWidth: 150 }}>
                  <button type="button" onClick={() => { setDraft(post.text ?? ''); setEditing(true); setMenuOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--ink)' }}>✏️ Edit post</button>
                  <button type="button" disabled={del.isPending}
                    onClick={() => { setMenuOpen(false); if (window.confirm('Delete this post? This cannot be undone.')) del.mutate(post.id); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: '#c0392b' }}>🗑 Delete post</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {(post.tagged?.length ?? 0) > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          with {post.tagged!.map((t) => t.name).join(', ')}
        </p>
      )}

      {/* media-first: single image full-bleed; multiple as a swipe carousel */}
      {images.length === 1 && (
        <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden' }}>
          <ImgCell url={images[0].url} adaptive alt={`Photo shared by ${post.author.name}`} />
        </div>
      )}
      {images.length > 1 && <ImageCarousel images={images} authorName={post.author.name} />}
      {videos.map((m, i) => <VideoFrame key={m.id} url={m.url} isNew={isNew} vref={i === 0 ? vidRef : undefined} autoInView={autoplayVideo} />)}

      {manage && isMine && videos.length > 0 && onSetCover && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-line btn-sm" disabled={coverBusy}
            onClick={() => onSetCover(vidRef.current?.currentTime ?? 0)}>
            {coverBusy ? 'Setting cover…' : '🖼 Set current frame as cover'}
          </button>
          <span className="muted" style={{ fontSize: 11.5 }}>Pause the video on the frame you want, then set it — it’s pinned for good.</span>
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 12 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2200} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={upd.isPending}
              onClick={() => upd.mutate({ postId: post.id, text: draft }, { onSuccess: () => setEditing(false) })}
              className="btn btn-accent btn-sm">{upd.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(post.text ?? ''); }} className="btn btn-line btn-sm">Cancel</button>
          </div>
        </div>
      ) : (
        post.text && <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{post.text}</p>
      )}

      <div style={{ display: 'flex', gap: 20, marginTop: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => like.mutate(post.id)} style={actionStyle(post.likedByMe)}>
          {post.likedByMe ? '❤️' : '🤍'} {post.likes}
        </button>
        <button type="button" onClick={() => setShowComments((s) => !s)} style={actionStyle()}>
          💬 {post.comments}
        </button>
        <button type="button" onClick={() => setShareOpen(true)} style={actionStyle()}>↗ Share</button>
        <button type="button" disabled={repost.isPending || reposted}
          onClick={() => repost.mutate(post.id, { onSuccess: () => setReposted(true) })} style={actionStyle(reposted)}>
          🔁 {reposted ? 'Shared' : 'Repost'}
        </button>
        <button type="button" onClick={() => setSaved(toggleSaved(post))} style={actionStyle(saved)}>
          🔖 {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {showComments && <CommentsPanel postId={post.id} />}
      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
    </article>
  );
}
