/**
 * Voice trainer — a thin wrapper over the browser Web Speech API (speechSynthesis).
 * Runs entirely on the user's device; no audio leaves the browser.
 */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let lastSpoken = '';

/** Speak a line. `interrupt` cancels anything queued (use for urgent form cues). */
export function say(text: string, opts: { interrupt?: boolean; rate?: number; pitch?: number } = {}) {
  if (!speechSupported() || !text) return;
  if (opts.interrupt) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
  lastSpoken = text;
}

/** Speak only if different from the last cue — avoids repeating the same correction every frame. */
export function sayOnce(text: string, opts: { rate?: number } = {}) {
  if (text === lastSpoken) return;
  say(text, opts);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
  lastSpoken = '';
}
