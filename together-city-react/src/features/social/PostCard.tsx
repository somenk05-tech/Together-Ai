import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { Button, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { ShareModal } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import { setMuted, playWithSharedSound, releasePlayback, knownRatio, rememberRatio } from '@/lib/mediaState';
import { useQueryClient } from '@tanstack/react-query';
import { onStaleMedia } from '@/lib/remint';
import { HeartIcon, CommentIcon, SendIcon, SaveIcon, ShareIcon, PlaceIcon } from './marks';
import { ReportMenu } from './report';
import { Confirm } from './Confirm';
import {
  useAddComment, useComments, useDeleteComment, useDeletePost, useUpdatePost, useRepost, useToggleBookmark, useToggleLike,
  type Post, type PostComment, type PostMedia,
} from './api';

/**
 * The date as the owner's card reference prints it: `26-nov-2016`, lowercase.
 * An absolute date and not "3h ago", because the reference's right-hand column
 * is a record of WHEN and WHERE — a save-the-date, a place, a year — and a
 * relative time is a record of how long you have been scrolling.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function postDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function timeAgo(iso: string): string {
  // `postDate` six lines up guards this and this did not, so an unparseable
  // date rendered as "NaN min" — on every comment, on every tile of the desktop
  // wall, and in the notification list (30 Aug audit).
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
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

/**
 * SAVED POSTS LEFT THE DEVICE (4 Sep audit).
 *
 * The bookmark store that lived here — per-account localStorage keys, a
 * one-time migration off the device-wide key, a quota rollback so "Saved"
 * was never a lie — was careful code solving the wrong problem. A snapshot
 * of a post carries its signed media URL, which expires in an hour, so every
 * saved photograph was broken by the time anybody came back for it; and the
 * list stayed on the one device it was made on. A bookmark is a row on the
 * account now (`useToggleBookmark`), and the Saved page re-reads each post
 * through the feed's own gates. `Saved.tsx` still reads the old keys ONCE,
 * to carry a device's bookmarks onto the account, and then clears them.
 */
export const LEGACY_SAVED_ROOT = 'tc-saved-posts';

/**
 * ONE COMMENT, AND THE TWO THINGS YOU CAN DO ABOUT IT.
 *
 * Shared with the reels player, because until 30 Aug neither surface had
 * either control and the fix was worth writing once. `canRemove` is true for
 * the person who wrote it and for whoever owns the post it is sitting on — it
 * is their wall, and "wait for a moderator to read a queue" is not a remedy
 * that arrives on the evening it is needed.
 */
export function CommentRow({ comment, postId, canRemove }: {
  comment: PostComment; postId: string; canRemove: boolean;
}) {
  const del = useDeleteComment();
  const [failed, setFailed] = useState(false);
  return (
    <div className="sl-c-row">
      <Avatar name={comment.author.name} src={comment.author.profileImage} />
      <div className="sl-c-body">
        <span className="sl-c-name">{comment.author.name}</span>
        <span className="sl-c-when">{timeAgo(comment.createdAt)}</span>
        <div className="sl-c-text">{comment.text}</div>
        <div className="sl-c-acts">
          {canRemove && (
            <button type="button" className="sl-c-del" disabled={del.isPending}
              onClick={() => { setFailed(false); del.mutate({ postId, commentId: comment.id }, { onError: () => setFailed(true) }); }}>
              {del.isPending ? 'Removing…' : 'Remove'}
            </button>
          )}
          <ReportMenu targetType="comment" targetId={comment.id} compact />
          {failed && <span className="sl-report-fail" role="alert">Couldn’t remove that — try again.</span>}
        </div>
      </div>
    </div>
  );
}

function CommentsPanel({ postId, canModerate }: { postId: string; canModerate: boolean }) {
  const comments = useComments(postId);
  const add = useAddComment();
  const { user } = useAuth();
  const myId = user?.id;
  const [text, setText] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);
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
  /* Oldest first, a page at a time. `pages` is flattened here rather than in
     the hook so the loading state of the NEXT page stays separate from the
     first — "Older comments" should say it is working without the thread
     blanking. */
  const rows = (comments.data?.pages ?? []).flatMap((pg) => pg.items);
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      {comments.isLoading && <Spinner />}
      {comments.isError && (
        <p className="muted" style={{ fontSize: 12.5 }}>Comments didn’t load — they’re still there. Try again in a moment.</p>
      )}
      {rows.map((c) => (
        <CommentRow key={c.id} comment={c} postId={postId}
          canRemove={canModerate || c.author.id === myId} />
      ))}
      {comments.hasNextPage && (
        <button type="button" className="btn btn-line btn-sm sl-more"
          disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
          {comments.isFetchingNextPage ? 'Loading…' : 'Show more comments'}
        </button>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
        <Button type="submit" variant="line" size="sm" disabled={add.isPending || !text.trim()}>Reply</Button>
      </form>
      {sendErr && <p role="alert" className="sl-fail-alert">{sendErr}</p>}
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
  const qc = useQueryClient();
  return (
    <div style={{ position: 'relative', aspectRatio: String(shown), maxHeight: adaptive ? 720 : undefined, background: 'var(--media-bg)' }}>
      <img src={url} alt={alt} loading="lazy" decoding="async"
        onError={() => onStaleMedia(qc, ['social'])}
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
  const qc = useQueryClient();
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
      {/* A KEYBOARD CAN TURN THE PAGE (4 Sep audit). The strip scrolled by
          touch and wheel only; the dots were decorative; nothing was focusable.
          The strip is the one focusable thing, named as a carousel, and the
          arrows move it a slide at a time. */}
      <div ref={ref} onScroll={onScroll} className="tc-hscroll" tabIndex={0}
        role="group" aria-roledescription="carousel" aria-label={`${images.length} photos shared by ${authorName}, photo ${idx + 1}`}
        onKeyDown={(e) => {
          const el = ref.current;
          if (!el) return;
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = Math.min(images.length - 1, Math.max(0, idx + step));
          el.scrollTo({ left: next * el.clientWidth });
        }}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', borderRadius: 'var(--r-2)', scrollbarWidth: 'none', aspectRatio: String(shown), maxHeight: 640, background: 'var(--media-bg)' }}>
        {images.map((m, i) => (
          <div key={m.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', height: '100%' }}>
            {/* contain, so portrait photos are never cropped (letterboxed if the
                slide's shape differs) */}
            <img src={m.url} alt={`Photo shared by ${authorName}`} loading="lazy" decoding="async"
              onError={() => onStaleMedia(qc, ['social'])}
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
function VideoFrame({ url, poster, isNew, vref, autoInView, onEnded }: { url: string; poster?: string | null; isNew: boolean; vref?: Ref<HTMLVideoElement>; autoInView?: boolean; onEnded?: () => void }) {
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
  /**
   * ── AND IT FLIPS BACK, WHICH IT DID NOT (31 Aug) ────────────────────────
   *
   * `setNear(true); io.disconnect();` — true once, and never again false. So
   * every video the citizen scrolled PAST kept its `src` attached with
   * `preload="auto"` for the life of the page. Ten pages of a video-heavy feed
   * is dozens of `<video>` elements each holding a buffer and a decoder, and
   * the browser's six-connections-per-host all spent on files nobody is
   * looking at any more. That is the scroll stutter that gets worse the longer
   * you scroll, and the hitch in the one video you ARE watching: it is queued
   * behind the ones you have already left.
   *
   * ReelsView fixed exactly this on 30 Aug and wrote down why — "two hundred
   * `<video>` elements holding two hundred buffers: on mobile Safari that is a
   * tab crash, not a slowdown". The feed card is the other player and never
   * got it. Same defect, same paragraph, one surface.
   *
   * Leaving the window releases the bytes. `isNew` stays pinned, because that
   * video is the reason the citizen is on this page.
   */
  useEffect(() => {
    if (isNew) return;
    const el = localRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      setNear(entries[0].isIntersecting);
    }, { rootMargin: '150% 0px 150% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [isNew]);

  /**
   * ── THE WISH TO PLAY, AND THE MOMENT IT CAN BE GRANTED ──────────────────
   *
   * A card can become mostly-visible BEFORE `near` has attached the src — a
   * fast fling outruns the preload margin — and `play()` on a source-less
   * element rejects. So the wish is KEPT and honoured when the source arrives.
   *
   * That recovery used to hang on a `loadeddata` listener alone, which was
   * safe while `preload="auto"` made the event a near-certainty. It is not
   * safe now: with `preload="metadata"` the browser is entitled to stop after
   * the header, and whether it decodes a first frame — which is what
   * `loadeddata` means — is a decision each browser makes differently. Mobile
   * Safari is the conservative one, and a fast fling on a phone is exactly the
   * case this exists for. Weakening the preload without moving this would have
   * traded a bandwidth bug for a video that silently never starts.
   *
   * So the wish lives in a ref and the src's own arrival triggers it, in the
   * effect below. React attaches the attribute in the commit that flips
   * `near`, and effects run after the DOM is updated, so by the time it asks
   * there is something to play. The `loadeddata` listener stays as the second
   * path, because two cheap ways to notice are better than one.
   */
  const wantsPlay = useRef(false);
  const attempt = useCallback(() => {
    const el = localRef.current;
    if (wantsPlay.current && el && el.getAttribute('src')) playWithSharedSound(el);
  }, []);
  useEffect(() => { if (near) attempt(); }, [near, attempt]);

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
    el.addEventListener('loadeddata', attempt);
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.6) { wantsPlay.current = true; attempt(); }
      else { wantsPlay.current = false; el.pause(); releasePlayback(el); }
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => {
      io.disconnect();
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('loadeddata', attempt);
      wantsPlay.current = false;
      releasePlayback(el);
    };
  }, [autoInView, attempt]);
  return (
    <div className="vf-wrap">
      {/**
        * THE POSTER IS THE PICTURE, AND IT WAS ALREADY PAID FOR.
        *
        * A video card rendered a bare `<video>`: nothing to look at until
        * enough of a fifty-megabyte file arrived to decode one frame. Which
        * means the feed downloaded video bytes to show a still — for every
        * video within the preload window, whether or not anybody watched one.
        *
        * The still already exists. `thumbUrl` is the poster frame the composer
        * captures, the guard screens, the purge tracks and the API signs; the
        * profile grid and the reels player both render it. Handing it to
        * `poster` paints the card from a ~50 KB JPEG and asks for no video
        * bytes at all until the citizen decides to watch.
        *
        * PRELOAD IS `metadata`, NOT `auto`. `auto` is "take as much of this as
        * you can", said about a fifty-megabyte file, about every video within
        * a screen and a half — which is how the one being watched ends up
        * queued behind four that are not. Metadata is duration and dimensions.
        * The video actually playing, and a just-posted one, get `auto`.
        */}
      <video ref={setRefs} src={near ? url : undefined}
        poster={poster ?? undefined}
        preload={!near ? 'none' : (isNew || playing || ctl) ? 'auto' : 'metadata'}
        /* THE LOOP IS OFF EXACTLY WHERE SOMETHING IS WAITING FOR THE END (4 Sep).
           A looping video never fires `ended`, so an auto-advance wired to it
           would be dead code that typechecked. The Videos feed keeps its loop. */
        controls={ctl} playsInline autoPlay={isNew} muted={isNew || autoInView} loop={!onEnded && (isNew || autoInView)}
        onEnded={onEnded}
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
        style={{ width: '100%', aspectRatio: String(ar), maxHeight: 720, objectFit: 'contain', background: 'var(--media-bg)', display: 'block' }} />
      {/* The one affordance a bare paused video still owes: a play glyph.
          pointer-events: none — the tap lands on the video underneath. */}
      {!ctl && !playing && <span className="vf-play" aria-hidden><Icon name="play" size={22} /></span>}
    </div>
  );
}

/** One clean card for every kind of post — photo, video, check-in, text.
 *  `isNew` marks a just-posted item (a "New" chip, "Just now", auto-playing video).
 *  `manage` shows the author's Edit/Delete menu (used on the profile, not the feed).
 *  `onOpenAuthor` opens the author's profile (the parent owns the modal, so this
 *  component has no dependency on the profile page — avoids a circular import). */
export const PostCard = memo(function PostCard({ post, isNew = false, manage = false, onOpenAuthor, onSetCover, coverBusy = false, autoplayVideo = false, onVideoEnded }: {
  post: Post; isNew?: boolean; manage?: boolean; onOpenAuthor?: (handle: string) => void;
  onSetCover?: (timeSec: number) => void; coverBusy?: boolean; autoplayVideo?: boolean;
  /** The reader's auto-advance: fires when the card's FIRST video ends. */
  onVideoEnded?: () => void;
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
    // Escape closes it too — a menu a keyboard can open but not leave is a trap.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [menuOpen]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text ?? '');
  const [showComments, setShowComments] = useState(false);
  /**
   * WHAT WENT WRONG, ON THE CARD IT WENT WRONG ON (30 Aug audit).
   *
   * Thirteen mutations in api.ts and not one `onError` between them, so every
   * failure on this card was a silence: delete did nothing, an edit stayed
   * open, a repost never appeared, and a comment sat in the box. One line
   * under the row is enough — the citizen's next move is to try again, and
   * they cannot decide to do that if nothing told them.
   */
  const [actionErr, setActionErr] = useState<string | null>(null);
  const bookmark = useToggleBookmark();
  const saved = Boolean(post.savedByMe);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const images = post.media.filter((m) => m.kind === 'image');
  const videos = post.media.filter((m) => m.kind === 'video');
  const aud = post.audience ? AUD_ICON[post.audience] : undefined;

  const shareCard: ShareCard = {
    kind: 'post',
    hub: 'Social',
    title: post.text?.trim() ? (post.text.length > 90 ? post.text.slice(0, 90) + '…' : post.text) : `${post.author.name}'s post`,
    subtitle: `by ${post.author.name}${post.placeName ? ` · ${post.placeName}` : ''}`,
    /**
     * NO PICTURE ON THE CARD, AND THAT IS DELIBERATE (31 Aug audit).
     *
     * This read `images[0]?.url`, and social post media is a PRIVATE bucket
     * key signed on read — so the card carried a presigned URL: an unbound
     * bearer credential, persisted into a chat message forever, expiring into
     * a broken image, and shown to a recipient who may not be allowed to see
     * the post at all. The last of those is the real one: a card carrying the
     * photograph shows a friends-only picture to a stranger, which is the
     * repost-audience bug on a different surface.
     *
     * `deepLink` is the honest half. It goes to the permalink, and the
     * permalink runs assertCanView — so the recipient sees the post if they
     * may, and a 404 if they may not. The API drops a presigned card picture
     * too; this is the end of the same rule that a client cannot be trusted
     * to keep on its own.
     */
    image: null,
    // The post, not the feed. "View Post →" used to open the recipient's own
    // feed, which is not this post and may not contain it (30 Aug audit).
    deepLink: `/social/p/${post.id}`,
  };

  const openAuthor = () => onOpenAuthor?.(post.author.handle);

  return (
    <article className="card sl-post" style={isNew ? { boxShadow: '0 0 0 2px var(--accent)', animation: 'tc-pop var(--dur-base) var(--ease-out)' } : undefined}>
      {post.repostedBy && (
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="share" size={13} /> Shared by {post.repostedBy.name} <span style={{ fontWeight: 400 }}>@{post.repostedBy.handle}</span>
        </div>
      )}

      {/* THE PICTURE IS FIRST. It used to be third, under a 40px avatar and two
          lines of chrome; nobody scrolls a feed to read a handle. Single image
          full-bleed inside the card's 12px mount; several as a swipe carousel. */}
      {images.length === 1 && (
        <div className="sl-media">
          <ImgCell url={images[0].url} adaptive alt={`Photo shared by ${post.author.name}`} />
        </div>
      )}
      {images.length > 1 && <ImageCarousel images={images} authorName={post.author.name} />}
      {/* Only the first video of a card reports its end — a carousel of clips
          would otherwise advance the column three times. */}
      {videos.map((m, i) => (
        /* A video the worker has not finished with yet (5 Sep) is its poster
           and a line, not a player: the file as uploaded may not play here. */
        m.state === 'processing'
          ? <div key={m.id} className="sl-processing">{m.thumbUrl && <img src={m.thumbUrl} alt="" />}<span>Getting this video ready…</span></div>
          : <VideoFrame key={m.id} url={m.url} poster={m.thumbUrl} isNew={isNew} vref={i === 0 ? vidRef : undefined} autoInView={autoplayVideo} onEnded={i === 0 ? onVideoEnded : undefined} />
      ))}

      {manage && isMine && videos.length > 0 && onSetCover && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-line btn-sm" disabled={coverBusy}
            onClick={() => onSetCover(vidRef.current?.currentTime ?? 0)}>
            {coverBusy ? 'Setting cover…' : <><Icon name="image" size={14} /> Set current frame as cover</>}
          </button>
          <span className="muted" style={{ fontSize: 11.5 }}>Pause the video on the frame you want, then set it — it’s pinned for good.</span>
        </div>
      )}

      {/* One block read in two directions: who and what on the left, when and
          where on the right, each ranged to the margin the picture already set. */}
      <div className="sl-post-foot">
        <div className="sl-post-head">
          <button type="button" className="sl-post-av" onClick={openAuthor} aria-label={`View ${post.author.name}'s profile`}
            style={{ cursor: onOpenAuthor ? 'pointer' : 'default' }}>
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
            {editing ? (
              <div style={{ marginTop: 8 }}>
                <textarea aria-label="Edit your post" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2200} autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" disabled={upd.isPending}
                    onClick={() => { setActionErr(null); upd.mutate({ postId: post.id, text: draft }, { onSuccess: () => setEditing(false), onError: () => setActionErr('That edit wasn’t saved — try again.') }); }}
                    className="btn btn-accent btn-sm">{upd.isPending ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={() => { setEditing(false); setDraft(post.text ?? ''); }} className="btn btn-line btn-sm">Cancel</button>
                </div>
              </div>
            ) : (
              post.text && <p className="sl-post-text">{post.text}</p>
            )}
            {/* Who it was written for, how they felt, and who was there. Not in
                the reference, and not invented either — it is what the composer
                already collects, kept in one quiet line under the caption
                instead of above the picture. */}
            {(post.feeling || aud || (post.tagged?.length ?? 0) > 0) && (
              <div className="sl-post-meta">
                {post.feeling && <span>feeling {post.feeling}</span>}
                {(post.tagged?.length ?? 0) > 0 && <span>with {post.tagged!.map((t) => t.name).join(', ')}</span>}
                {aud && <span title={post.audience} style={{ display: 'inline-flex' }}><Icon name={aud} size={13} /></span>}
              </div>
            )}
          </div>
        </div>

        <div className="sl-post-where">
          <div className="sl-post-when">
            <span>{isNew ? 'just now' : postDate(post.createdAt)}</span>
            {/* NOT `manage && isMine` ANY MORE (30 Aug audit). `manage` was passed
                only by the profile reader, so the post a citizen had just made
                had no options button in the feed they were looking at it in —
                to delete it they had to navigate to their profile and find the
                tile. And somebody ELSE's post had no control at all, which is
                why the only report button in the hub was on a profile. Now:
                your own post carries Edit and Delete wherever it is shown, and
                anybody else's carries Report. */}
            {!isMine && <ReportMenu targetType="post" targetId={post.id} />}
            {isMine && (
              <span ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
                <button type="button" aria-label="Post options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, color: 'var(--muted)', padding: '4px 2px', minHeight: 44 }}>
                  <Icon name="more" size={19} />
                </button>
                {menuOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 21, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--e2)', overflow: 'hidden', minWidth: 150, textAlign: 'left' }}>
                    <button type="button" onClick={() => { setDraft(post.text ?? ''); setEditing(true); setMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--ink)' }}><Icon name="edit" size={14} /> Edit post</button>
                    <button type="button" disabled={del.isPending}
                      onClick={() => { setMenuOpen(false); setActionErr(null); setConfirmDelete(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--danger-ink)' }}><Icon name="close" size={14} /> Delete post</button>
                  </div>
                )}
              </span>
            )}
          </div>
          {post.placeName && (
            <div className="sl-post-place">
              <span className="sl-mark-place"><PlaceIcon /></span>{post.placeName}
            </div>
          )}
        </div>
      </div>

      {/* FIVE MARKS, AND THE FIFTH CAME BACK (30 Aug audit, owner's call).
          The reference draws four and the card shipped four — which left
          `useToggleLike` with exactly one caller in the whole application, so a
          citizen on a phone could not like anything except a video opened
          through the Videos tab, while the desktop wall went on showing them a
          like count. A count with no path to it is the product implying a
          gesture it does not have. Send is this moment into somebody's chat;
          Share is it back into the city; the heart is the heart. */}
      <div className="sl-acts">
        <button type="button" className="sl-act sl-mk-like"
          aria-pressed={post.likedByMe} aria-label={`${post.likes} ${post.likes === 1 ? 'like' : 'likes'}`}
          onClick={() => { setActionErr(null); like.mutate(post.id, { onError: () => setActionErr('That like didn’t register — try again.') }); }}>
          <span className="sl-mark"><HeartIcon filled={post.likedByMe} /></span>
          <span>{post.likedByMe ? 'Liked' : 'Like'}{post.likes ? <span className="sl-n"> {post.likes}</span> : null}</span>
        </button>
        <button type="button" className="sl-act sl-mk-comment"
          aria-expanded={showComments} aria-label={`${post.comments} ${post.comments === 1 ? 'comment' : 'comments'}`}
          onClick={() => setShowComments((s) => !s)}>
          <span className="sl-mark"><CommentIcon /></span>
          <span>Comment{post.comments ? <span className="sl-n"> {post.comments}</span> : null}</span>
        </button>
        <button type="button" className="sl-act sl-mk-send" onClick={() => setShareOpen(true)}>
          <span className="sl-mark"><SendIcon /></span><span>Send</span>
        </button>
        <button type="button" className="sl-act sl-mk-save"
          aria-pressed={saved} aria-label={saved ? 'Saved to your bookmarks' : 'Save this post'}
          onClick={() => { setActionErr(null); bookmark.mutate(post.id, { onError: () => setActionErr(saved ? 'That post is still saved — try again.' : 'That save didn’t register — try again.') }); }}>
          <span className="sl-mark"><SaveIcon filled={saved} /></span><span>{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button type="button" className="sl-act sl-mk-share" disabled={repost.isPending || reposted}
          onClick={() => { setActionErr(null); repost.mutate(post.id, { onSuccess: () => setReposted(true), onError: () => setActionErr('That share didn’t go through — try again.') }); }}>
          <span className="sl-mark"><ShareIcon /></span><span>{reposted ? 'Shared' : 'Share'}</span>
        </button>
      </div>

      {actionErr && <p role="alert" className="sl-fail-alert">{actionErr}</p>}

      {showComments && <CommentsPanel postId={post.id} canModerate={isMine} />}
      {shareOpen && <ShareModal item={shareCard} onClose={() => setShareOpen(false)} />}
      <Confirm open={confirmDelete} title="Delete this post?" body="It comes off the city feed and your profile, and its photographs leave the bucket. This cannot be undone."
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete post'} danger busy={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          del.mutate(post.id, {
            onSuccess: () => setConfirmDelete(false),
            onError: () => { setConfirmDelete(false); setActionErr('That post wasn’t deleted — it is still here. Try again.'); },
          });
        }} />
    </article>
  );
});
