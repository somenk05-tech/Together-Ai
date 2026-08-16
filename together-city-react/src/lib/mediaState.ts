/**
 * ONE SOUND, ONE PLAYER, ONE MEMORY OF EVERY PICTURE'S SHAPE.
 *
 * Three module singletons that make the feed scroll like a native player
 * instead of a page of independent videos. None of them renders anything.
 *
 * 1. THE SOUND STATE. Every video surface — the reels player, the feed's
 *    autoplaying cards, the profile reader — used to keep its own idea of
 *    whether the citizen wanted sound. Scrolling from one card to the next
 *    could therefore mute, unmute or restart audio depending on which
 *    component happened to mount. This is the single preference they all
 *    read and write; toggling it anywhere applies everywhere, imperatively
 *    (`el.muted = …`), so no component re-renders on a scroll frame to keep
 *    it true. It starts UNMUTED — the reels player's long-standing default.
 *
 * 2. THE PLAYBACK CLAIM. Instagram never plays two videos at once. Each
 *    video claims playback as it starts; the claim pauses whichever element
 *    held it before. IntersectionObservers decide WHO claims — this decides
 *    that there is only ever one.
 *
 * 3. THE SHAPE MEMORY. A feed card frames media at 16:9 until the pixels
 *    arrive and then re-frames to the real ratio — a layout shift that
 *    yanks the scroll position every time a tall video loads under your
 *    thumb. The real ratio, once known, is remembered by URL, so a card
 *    scrolled back to (or remounted by pagination) frames itself correctly
 *    BEFORE the media loads. First-ever sight of a picture still shifts
 *    once — the server does not send dimensions — but never twice.
 */

let muted = false;
const muteListeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  if (m === muted) return;
  muted = m;
  muteListeners.forEach((fn) => fn(m));
}

/** Subscribe to mute changes. Returns the unsubscribe. Listeners are called
 *  only on an actual flip, never per scroll frame. */
export function subscribeMuted(fn: (m: boolean) => void): () => void {
  muteListeners.add(fn);
  return () => { muteListeners.delete(fn); };
}

let active: HTMLVideoElement | null = null;

/** Claim playback for `el`, pausing whichever video held the claim before.
 *  Call just before `el.play()`. */
export function claimPlayback(el: HTMLVideoElement): void {
  if (active && active !== el && !active.paused) active.pause();
  active = el;
}

/** Release the claim if `el` still holds it. Call on pause-out and unmount so
 *  a dead element is never the thing a live one tries to pause. */
export function releasePlayback(el: HTMLVideoElement): void {
  if (active === el) active = null;
}

const ratios = new Map<string, number>();

/** The remembered width/height ratio for a media URL, if it has ever loaded. */
export function knownRatio(url: string): number | undefined {
  return ratios.get(url);
}

export function rememberRatio(url: string, ratio: number): void {
  if (Number.isFinite(ratio) && ratio > 0) ratios.set(url, ratio);
}

/**
 * Play `el` respecting the shared sound preference. Autoplay with sound is
 * refused by every mobile browser until the citizen has interacted
 * (NotAllowedError); when the unmuted attempt is refused, this retries muted
 * rather than not playing at all — the video moves, and the next tap on the
 * speaker gives it its voice. ONLY that refusal mutes: any other failure
 * (a source still attaching, a decode error) must not eat the preference.
 * The GLOBAL preference is not flipped by the retry either: wanting sound
 * and being temporarily refused it are different states.
 */
export function playWithSharedSound(el: HTMLVideoElement): void {
  el.muted = muted;
  claimPlayback(el);
  void el.play().catch((err: unknown) => {
    if (el.muted || (err as { name?: string })?.name !== 'NotAllowedError') return;
    el.muted = true;
    void el.play().catch(() => {});
  });
}
