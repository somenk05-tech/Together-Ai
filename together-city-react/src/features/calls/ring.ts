/**
 * The sound of a call.
 *
 * An incoming call that appears silently is a call that only exists if you
 * happen to be looking at the tab — which is most of the way to not ringing
 * at all. This synthesizes the two tones a phone user already knows (no audio
 * asset, nothing fetched): the RING for a call arriving, and the softer
 * RINGBACK a caller hears while waiting.
 *
 * Best-effort by design. Browsers gate audio behind a prior user gesture; on
 * a page the citizen has never touched, resume() is refused and the call
 * rings silently — exactly what happened before this file existed, so the
 * failure mode is the status quo, never worse. stop() is idempotent and
 * always safe.
 */

type RingKind = 'ring' | 'ringback';

class CallRinger {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  start(kind: RingKind): void {
    this.stop();
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx ??= new Ctor();
      void this.ctx.resume().catch(() => undefined);
    } catch { return; }

    // Indian ring cadence: 0.4s on, 0.2s off, 0.4s on, 2s silence.
    // Ringback is the same shape, quieter — the caller knows they placed it.
    const burst = () => this.burst(kind === 'ring' ? 0.16 : 0.07);
    burst();
    this.timer = setInterval(burst, 3000);

    // A phone in a pocket rings with its body too. Vibration is gated on the
    // same user-gesture rules as audio; a refusal is silent and fine.
    if (kind === 'ring') {
      try { navigator.vibrate?.([400, 200, 400]); } catch { /* not on this device */ }
    }
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const { osc, gain } of this.nodes.splice(0)) {
      try { gain.gain.cancelScheduledValues(0); gain.gain.value = 0; osc.stop(); } catch { /* already stopped */ }
    }
    try { navigator.vibrate?.(0); } catch { /* not on this device */ }
  }

  /** One on-off-on cadence: dual tone (400 + 450 Hz), two 0.4s bursts. */
  private burst(volume: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') { void ctx?.resume().catch(() => undefined); }
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (const freq of [400, 450]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      // burst 1: 0 → 0.4s   burst 2: 0.6 → 1.0s (20ms ramps to avoid clicks)
      for (const [on, off] of [[0, 0.4], [0.6, 1.0]] as const) {
        gain.gain.linearRampToValueAtTime(volume, t0 + on + 0.02);
        gain.gain.setValueAtTime(volume, t0 + off - 0.02);
        gain.gain.linearRampToValueAtTime(0, t0 + off);
      }
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.1);
      this.nodes.push({ osc, gain });
      osc.onended = () => { this.nodes = this.nodes.filter((n) => n.osc !== osc); };
    }
  }
}

export const callRinger = new CallRinger();
