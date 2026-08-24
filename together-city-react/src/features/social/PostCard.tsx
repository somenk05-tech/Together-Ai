import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { Button, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { setMuted, playWithSharedSound, releasePlayback, knownRatio, rememberRatio } from '@/lib/mediaState';
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
      background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 14, flexShrink: 0,
    }}>
      {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );
}

/* Who a post was written for, as a mark rather than an emoji: the same line set
 * the rest of Social Life's chrome uses. `public` has none — it is the default,
 * and a globe beside every post in a public feed says nothing. */
const AUD_ICON: Record<string, IconName> = { friends: 'people', family: 'connection', private: 'shield' };

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
      {comments.isError && (
        <p className="muted" style={{ fontSize: 12.5 }}>Comments didn’t load — they’re still there. Try again in a moment.</p>
      )}
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
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
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
  // THE RATIO IS REMEMBERED BY URL (mediaState), so a card scrolled back to —
  // or remounted by pagination — frames itself correctly BEFORE the pixels
  // arrive, instead of re-playing the 16:9 → real-shape layout jump.
  const [ar, setAr] = useState(() => (adaptive && knownRatio(url)) || 16 / 9); // width / height
  const shown = adaptive ? ar : 16 / 9;
  return (
    <div style={{ position: 'relative', aspectRatio: String(shown), maxHeight: adaptive ? 720 : undefined, background: 'var(--media-bg)' }}>
      <img src={url} alt={alt} loading="lazy" decoding="async"
        onLoad={(e) => {
          const r = e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight);
          rememberRatio(url, r);
          if (adaptive) setAr(r);
        }}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      {overlay}
    </div>
  );
}

/** Multiple images as a horizontal swipe/scroll carousel — every image is
 *  reachable (no more +N cutoff), with dot indicators and a counter. */
function ImageCarousel({ images, authorName }: { images: PostMedia[]; authorName: string }) {
  const [idx, setIdx] = useState(0);
  // true shape from the first image (any ratio); remembered by URL so a
  // remounted carousel opens at the right height with no layout jump.
  const [ar, setAr] = useState(() => knownRatio(images[0]?.url ?? '') ?? 16 / 9);
  const shown = ar;
  const ref = useRef<HTMLDivElement>(null);
  // setState with an unchanged index is a no-op render-wise, so this handler
  // costs a division per scroll event and a render only when the page flips.
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <div ref={ref} onScroll={onScroll} className="tc-hscroll"
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', borderRadius: 'var(--r-2)', scrollbarWidth: 'none', aspectRatio: String(shown), maxHeight: 640, background: 'var(--media-bg)' }}>
        {images.map((m, i) => (
          <div key={m.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', height: '100%' }}>
            {/* contain, so portrait photos are never cropped (letterboxed if the
                slide's shape differs) */}
            <img src={m.url} alt={`Photo shared by ${authorName}`} loading="lazy" decoding="async"
              onLoad={i === 0 ? (e) => { const r = e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight); rememberRatio(m.url, r); setAr(r); } : undefined}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(0,0,0,.55)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', pointerEvents: 'none' }}>
        {idx + 1} / {images.length}
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
        {images.map((m, i) => (
          <span key={m.id} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? 'var(--on-accent)' : 'rgba(255,255,255,.5)' }} />
        ))}
      </div>
    </div>
  );
}

/** A feed video framed 16:9 (landscape) or 9:16 (vertical) by its real dimensions.
 *  `autoInView` makes it autoplay (muted) while scrolled into view and pause when
 *  it leaves — used by the "Videos" feed section. */
function VideoFrame({ url, isNew, vref, autoInView }: { url: string; isNew: boolean; vref?: Ref<HTMLVideoElement>; autoInView?: boolean }) {
  // Real width / height — remembered by URL, so scrolling back to a video (or
  // a pagination remount) frames it correctly before metadata arrives.
  const [ar, setAr] = useState(() => knownRatio(url) ?? 16 / 9);
  /**
   * THE SRC WAITS UNTIL THE VIDEO IS NEARLY ON SCREEN.
   *
   * Every card in the wall carried a `src`, so opening the feed opened a
   * connection for every video in it — and the browser, with six per host,
   * queued the one the citizen was actually looking at behind a dozen they
   * would never reach. A just-posted video is the exception: it is the reason
   * the citizen is on this page, and it loads at once.
   */
  const [near, setNear] = useState(isNew);
  /**
   * THE CONTROLS WAIT FOR A TAP (owner, 24 Aug: the play button and the
   * ±10s rings sat on every video in the feed). A feed video shows the
   * picture; the first tap starts it — or, once started, summons the native
   * controls. The overlay is the browser's own, so nothing here re-invents
   * scrubbing; it is only no longer uninvited.
   */
  const [ctl, setCtl] = useState(false);
  const [playing, setPlaying] = useState(false);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const setRefs = useCallback((el: HTMLVideoElement | null) => {
    localRef.current = el;
    if (typeof vref === 'function') vref(el);
    else if (vref) (vref as MutableRefObject<HTMLVideoElement | null>).current = el;
  }, [vref]);
  useEffect(() => {
    if (near) return;
    const el = localRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: '200% 0px 200% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  /**
   * ONE VIDEO PLAYS, AND IT PLAYS WITH THE CITIZEN'S OWN SOUND.
   *
   * The old handler forced `muted = true` on every play, so a citizen who had
   * unmuted one video was silenced again by the next card — the "audio randomly
   * cuts out while scrolling" bug. Play goes through the shared media state
   * now: the video claims playback (pausing whichever one held it), applies
   * the one app-wide sound preference, and falls back to muted only where the
   * browser refuses sound. Leaving the viewport pauses WITHOUT touching src,
   * currentTime or the element itself, so scrolling back resumes instantly.
   */
  useEffect(() => {
    if (!autoInView) return;
    const el = localRef.current;
    if (!el) return;
    // The citizen's use of the native controls' speaker IS the preference —
    // fold it back into the shared state so the next video respects it.
    const onVolume = () => { if (!el.paused) setMuted(el.muted); };
    el.addEventListener('volumechange', onVolume);
    // The card can become mostly-visible BEFORE `near` has attached the src
    // (a fast fling outruns the preload margin). A play() on a source-less
    // element rejects and nothing would start it later — so the wish to play
    // is kept, and honoured the moment the data arrives.
    let wantsPlay = false;
    const attempt = () => { if (wantsPlay && el.getAttribute('src')) playWithSharedSound(el); };
    el.addEventListener('loadeddata', attempt);
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.6) { wantsPlay = true; attempt(); }
      else { wantsPlay = false; el.pause(); releasePlayback(el); }
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => {
      io.disconnect();
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('loadeddata', attempt);
      releasePlayback(el);
    };
  }, [autoInView]);
  return (
    <div className="vf-wrap">
      <video ref={setRefs} src={near ? url : undefined} preload={near ? 'auto' : 'none'}
        controls={ctl} playsInline autoPlay={isNew} muted={isNew || autoInView} loop={isNew || autoInView}
        onClick={() => {
          // First tap: play a paused video, and hand over the native controls.
          if (ctl) return;
          setCtl(true);
          const el = localRef.current;
          if (el && el.paused && el.getAttribute('src')) playWithSharedSound(el);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const r = (e.currentTarget.videoWidth || 16) / Math.max(1, e.currentTarget.videoHeight || 9);
          rememberRatio(url, r);
          setAr(r);
        }}
        style={{ width: '100%', aspectRatio: String(ar), maxHeight: 720, objectFit: 'contain', borderRadius: 'var(--r-2)', background: 'var(--media-bg)', display: 'block' }} />
      {/* The one affordance a bare paused video still owes: a play glyph.
          pointer-events: none — the tap lands on the video underneath. */}
      {!ctl && !playing && <span className="vf-play" aria-hidden>▶</span>}
    </div>
  );
}

/** One clean card for every kind of post — photo, video, check-in, text.
 *  `isNew` marks a just-posted item (a "New" chip, "Just now", auto-playing video).
 *  `manage` shows the author's Edit/Delete menu (used on the profile, not the feed).
 *  `onOpenAuthor` opens the author's profile (the parent owns the modal, so this
 *  component has no dependency on the profile page — avoids a circular import). */
export const PostCard = memo(function PostCard({ post, isNew = false, manage = false, onOpenAuthor, onSetCover, coverBusy = false, autoplayVideo = false }: {
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
  // Outside-tap closes the menu — a document listener, the same pattern the
  // header's NotificationBell uses. The old full-screen backdrop <div> was
  // `position: fixed` INSIDE the card, which the card's new
  // `content-visibility` containment would measure against the card instead
  // of the screen; a listener has no box to get wrong.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text ?? '');
  const [showComments, setShowComments] = useState(false);
  const [saved, setSaved] = useState(() => savedIds().has(post.id));
  const [shareOpen, setShareOpen] = useState(false);

  const images = post.media.filter((m) => m.kind === 'image');
  const videos = post.media.filter((m) => m.kind === 'video');
  const aud = post.audience ? AUD_ICON[post.audience] : undefined;

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
    <article className="card sl-post" style={isNew ? { boxShadow: '0 0 0 2px var(--accent)', animation: 'tc-pop var(--dur-base) var(--ease-out)' } : undefined}>
      {post.repostedBy && (
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="share" size={13} /> Shared by {post.repostedBy.name} <span style={{ fontWeight: 400 }}>@{post.repostedBy.handle}</span>
        </div>
      )}
      <div className="sl-post-head">
        <button type="button" onClick={openAuthor} aria-label={`View ${post.author.name}'s profile`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenAuthor ? 'pointer' : 'default', flexShrink: 0 }}>
          <Avatar name={post.author.name} src={post.author.profileImage} />
        </button>
        <div className="sl-post-id">
          <div className="sl-post-name">
            <button type="button" onClick={openAuthor}
              style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenAuthor ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}>
              {post.author.name}
            </button>
            <span className="sl-at"> @{post.author.handle}</span>
            {isNew && <span className="tag dark" style={{ fontSize: 10, marginLeft: 8 }}>New</span>}
          </div>
          {/* Place, time and audience on one line, in that order — where it
              happened, when, and who it was written for. */}
          <div className="sl-post-meta">
            {post.placeName && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="place" size={13} />{post.placeName}
              </span>
            )}
            {post.placeName && <span aria-hidden>·</span>}
            <span>{isNew ? 'Just now' : `${timeAgo(post.createdAt)} ago`}</span>
            {post.feeling && <span aria-hidden>·</span>}
            {post.feeling && <span>feeling {post.feeling}</span>}
            {aud && (
              <span title={post.audience} style={{ display: 'inline-flex' }}>
                <Icon name={aud} size={13} />
              </span>
            )}
          </div>
        </div>
        {manage && isMine && (
          <div ref={menuRef} style={{ position: 'relative', flex: 'none' }}>
            <button type="button" aria-label="Post options" onClick={() => setMenuOpen((o) => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, color: 'var(--muted)', padding: '4px 2px', minHeight: 44 }}>
              <Icon name="more" size={19} />
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 21, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,.16)', overflow: 'hidden', minWidth: 150 }}>
                  <button type="button" onClick={() => { setDraft(post.text ?? ''); setEditing(true); setMenuOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--ink)' }}><Icon name="edit" size={14} /> Edit post</button>
                  <button type="button" disabled={del.isPending}
                    onClick={() => { setMenuOpen(false); if (window.confirm('Delete this post? This cannot be undone.')) del.mutate(post.id); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--danger-ink)' }}><Icon name="close" size={14} /> Delete post</button>
              </div>
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
        <div className="sl-media">
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
          <textarea aria-label="Edit your post" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2200} autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={upd.isPending}
              onClick={() => upd.mutate({ postId: post.id, text: draft }, { onSuccess: () => setEditing(false) })}
              className="btn btn-accent btn-sm">{upd.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(post.text ?? ''); }} className="btn btn-line btn-sm">Cancel</button>
          </div>
        </div>
      ) : (
        post.text && <p className="sl-post-text">{post.text}</p>
      )}

      {/* The four things you can do to somebody else's moment, and the one you
          can do for yourself pushed to the far end — saving is private, and it
          is the only control here that changes nothing for the author. */}
      <div className="sl-acts">
        <button type="button" className={`sl-act${post.likedByMe ? ' on' : ''}`}
          aria-pressed={post.likedByMe} aria-label={`${post.likes} ${post.likes === 1 ? 'like' : 'likes'}`}
          onClick={() => like.mutate(post.id)}>
          <Icon name="heart" size={19} />{post.likes}
        </button>
        <button type="button" className={`sl-act${showComments ? ' on' : ''}`}
          aria-expanded={showComments} aria-label={`${post.comments} ${post.comments === 1 ? 'comment' : 'comments'}`}
          onClick={() => setShowComments((s) => !s)}>
          <Icon name="comment" size={19} />{post.comments}
        </button>
        <button type="button" className="sl-act" onClick={() => setShareOpen(true)}>
          <Icon name="share" size={18} />Share
        </button>
        <button type="button" className={`sl-act${reposted ? ' on' : ''}`} disabled={repost.isPending || reposted}
          onClick={() => repost.mutate(post.id, { onSuccess: () => setReposted(true) })}>
          <Icon name="reorder" size={18} />{reposted ? 'Shared' : 'Repost'}
        </button>
        <button type="button" className={`sl-act sl-act-end${saved ? ' on' : ''}`}
          aria-pressed={saved} aria-label={saved ? 'Saved to your bookmarks' : 'Save this post'}
          onClick={() => setSaved(toggleSaved(post))}>
          <Icon name="save" size={19} />
        </button>
      </div>

      {showComments && <CommentsPanel postId={post.id} />}
      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
    </article>
  );
});
