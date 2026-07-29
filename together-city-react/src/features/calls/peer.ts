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
}

export class CallPeer {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  /** Candidates that arrived before the remote description did. */
  private pending: RTCIceCandidateInit[] = [];

  constructor(private readonly opts: PeerOptions) {}

  get localStream(): MediaStream | null {
    return this.local;
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
          'The call could not connect. This usually means one of you is on a ' +
            'network that needs a relay server we have not set up yet.',
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
  }

  /** Handle one piece of the handshake from the other side. */
  async receive(kind: SignalKind, payload: unknown): Promise<void> {
    const pc = this.pc;
    if (!pc || this.closed) return;

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
   * Stop everything.
   *
   * Releasing the tracks matters more than closing the connection: a camera
   * light left on after a call is over is the kind of thing people remember
   * about an app, and not fondly.
   */
  close(): void {
    this.closed = true;
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
