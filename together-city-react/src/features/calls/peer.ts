/**
 * One WebRTC connection to one other person.
 *
 * Everything React-shaped is kept out of here on purpose: this is the part that
 * is hard to get right, and it is much easier to reason about as a small class
 * with an explicit lifecycle than as effects scattered through a component.
 *
 * The one piece of subtlety worth naming is glare. Both sides of a call can
 * decide to make an offer at the same moment, and the naive handling of that is
 * a connection that never completes — each side rejects the other's offer
 * because it is busy with its own. The fix is the standard "perfect
 * negotiation" pattern: one side is polite and rolls back its own offer when a
 * competing one arrives, the other is impolite and ignores the competition.
 * Which is which has to be agreed without a round trip, so it is derived from
 * something both sides already know: the person who started the call is
 * impolite. No coordination, no tie to break.
 */
export type SignalKind = 'offer' | 'answer' | 'ice' | 'renegotiate';

export interface OutboundSignal {
  callId: string;
  to: string;
  kind: SignalKind;
  payload: unknown;
}

export interface PeerOptions {
  callId: string;
  /** The other person. Every signal is addressed to them by id. */
  peerId: string;
  iceServers: RTCIceServer[];
  /** True for the side that must yield when both offer at once. */
  polite: boolean;
  wantsVideo: boolean;
  send: (signal: OutboundSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
  /** Something went wrong the citizen needs told about, in their words. */
  onFailure: (message: string) => void;
  /** Screen sharing started or stopped — including when the BROWSER stopped it
   *  via its own "Stop sharing" chrome, which the UI cannot see any other way. */
  onScreenShare?: (sharing: boolean) => void;
}

export class CallPeer {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  /** The camera track parked while its sender carries the screen instead. */
  private parkedCamera: MediaStreamTrack | null = null;
  private screen: MediaStream | null = null;
  /** Candidates that arrived before the remote description did. */
  private pending: RTCIceCandidateInit[] = [];
  /**
   * Signals that arrived before there was a connection to give them to.
   *
   * `start()` awaits getUserMedia, which can sit on a browser permission prompt
   * for as long as the person takes to click Allow — and CallCenter hands this
   * object to the socket the moment it is constructed, well before that. The
   * caller's offer and first candidates routinely arrive inside that window.
   * Dropped, they are never resent: the call rings, both sides believe they
   * connected, and nobody hears anything, with no error raised anywhere. So
   * they wait here and replay in order as soon as the connection is up.
   */
  private beforeStart: Array<{ kind: SignalKind; payload: unknown }> = [];

  constructor(private readonly opts: PeerOptions) {}

  get localStream(): MediaStream | null {
    return this.local;
  }

  /** The screen being shared, while one is. The self-view shows this instead of
   *  the camera, because a preview that shows your face while the other person
   *  sees your screen is a preview lying about what is being sent. */
  get screenStream(): MediaStream | null {
    return this.screen;
  }

  get sharingScreen(): boolean {
    return this.screen !== null;
  }

  /**
   * Ask for the microphone (and camera), then open the connection.
   *
   * Media is requested BEFORE any signalling so a refused permission ends the
   * call cleanly instead of leaving the other person watching a call that
   * connected to silence.
   */
  async start(): Promise<void> {
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.opts.wantsVideo,
      });
    } catch (e) {
      const name = (e as { name?: string }).name ?? '';
      this.opts.onFailure(
        name === 'NotAllowedError'
          ? 'Your browser blocked access to the microphone. Allow it and try again.'
          : name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : 'Could not open your microphone.',
      );
      throw e;
    }

    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers });
    this.pc = pc;
    for (const track of this.local.getTracks()) pc.addTrack(track, this.local);

    pc.ontrack = (ev) => {
      if (ev.streams[0]) this.opts.onRemoteStream(ev.streams[0]);
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.signal('ice', ev.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      this.opts.onStateChange(pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Almost always no TURN relay on a network that needs one. Say that,
        // rather than "connection failed", which tells the citizen nothing.
        this.opts.onFailure(
          'Couldn’t connect — one of you is on a network that needs a relay server we don’t have yet.',
        );
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) this.signal('offer', pc.localDescription.toJSON());
      } catch {
        /* a failed offer surfaces through connectionstatechange */
      } finally {
        this.makingOffer = false;
      }
    };

    // Anything that arrived while the permission prompt was open.
    for (const queued of this.beforeStart.splice(0)) {
      await this.receive(queued.kind, queued.payload);
    }
  }

  /** Handle one piece of the handshake from the other side. */
  async receive(kind: SignalKind, payload: unknown): Promise<void> {
    if (this.closed) return;
    const pc = this.pc;
    if (!pc) {
      // Not connected yet — see `beforeStart`. Held, never dropped.
      this.beforeStart.push({ kind, payload });
      return;
    }

    if (kind === 'ice') {
      const candidate = payload as RTCIceCandidateInit;
      // A candidate that arrives before the answer has nowhere to go yet.
      if (!pc.remoteDescription) {
        this.pending.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* a candidate that no longer applies is normal, not an error */
      }
      return;
    }

    const description = payload as RTCSessionDescriptionInit;
    const offerCollision =
      description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');

    this.ignoreOffer = !this.opts.polite && offerCollision;
    if (this.ignoreOffer) return;

    await pc.setRemoteDescription(description);
    for (const candidate of this.pending.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      if (pc.localDescription) this.signal('answer', pc.localDescription.toJSON());
    }
  }

  /** Mute or unmute the microphone. Returns the muted state afterwards. */
  toggleMute(): boolean {
    const track = this.local?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled;
  }

  /** Turn the camera off or on. Returns whether video is now off. */
  toggleCamera(): boolean {
    const track = this.local?.getVideoTracks()[0];
    if (!track) return true;
    track.enabled = !track.enabled;
    return !track.enabled;
  }

  /**
   * Put the screen where the camera was.
   *
   * `replaceTrack` on the existing video sender, not `addTrack`: same kind of
   * track on the same transceiver means NO renegotiation — nothing signalled,
   * nothing for glare to tangle — and the far side simply sees the picture
   * change. It also means this only works where a video sender exists, so
   * screen share is a video-call feature; on an audio call the far side's UI
   * draws no video surface and a track added mid-call would arrive unwatched.
   *
   * Returns whether the screen is now being shared. A citizen pressing Cancel
   * on the browser's picker is a decision, not a failure — it returns false
   * and says nothing, because they know what they just did.
   */
  async shareScreen(): Promise<boolean> {
    if (this.closed || this.screen) return this.sharingScreen;
    const sender = this.pc?.getSenders().find((x) => x.track?.kind === 'video');
    if (!sender || !sender.track) {
      this.opts.onFailure('Screen sharing needs a video call — start one and try again.');
      return false;
    }
    let captured: MediaStream;
    try {
      captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      const name = (e as { name?: string }).name ?? '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        this.opts.onFailure('Could not start screen sharing on this device.');
      }
      return false;
    }
    const track = captured.getVideoTracks()[0];
    if (!track) return false;

    this.parkedCamera = sender.track;
    this.screen = captured;
    await sender.replaceTrack(track);
    // Every browser puts its own "Stop sharing" button in the chrome, outside
    // this app entirely. Ending there must restore the camera exactly as our
    // own button does, or the call is left sending a frozen last frame.
    track.onended = () => { void this.stopScreenShare(); };
    this.opts.onScreenShare?.(true);
    return true;
  }

  /** Put the camera back. Safe to call twice — the browser's own stop and ours
   *  can race, and the second arrival must find nothing left to do. */
  async stopScreenShare(): Promise<void> {
    const screen = this.screen;
    if (!screen) return;
    this.screen = null;
    for (const t of screen.getTracks()) { t.onended = null; t.stop(); }
    const camera = this.parkedCamera;
    this.parkedCamera = null;
    const sender = this.pc?.getSenders().find((x) => x.track?.kind === 'video');
    if (sender && camera) await sender.replaceTrack(camera).catch(() => undefined);
    this.opts.onScreenShare?.(false);
  }

  /**
   * Stop everything.
   *
   * Releasing the tracks matters more than closing the connection: a camera
   * light left on after a call is over is the kind of thing people remember
   * about an app, and not fondly.
   */
  close(): void {
    this.closed = true;
    this.beforeStart = [];
    // The screen capture is a track like any other: left running it keeps the
    // browser's "sharing this screen" banner up after the call is gone.
    this.screen?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    this.screen = null;
    this.parkedCamera = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    try {
      this.pc?.close();
    } catch {
      /* already closed */
    }
    this.pc = null;
  }

  private signal(kind: SignalKind, payload: unknown): void {
    if (this.closed) return;
    this.opts.send({ callId: this.opts.callId, to: this.opts.peerId, kind, payload });
  }
}
