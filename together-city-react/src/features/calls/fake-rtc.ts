/**
 * A WebRTC stack small enough to reason about.
 *
 * Not a simulator — just enough of RTCPeerConnection to drive the negotiation
 * paths CallPeer actually depends on: signalingState, setLocalDescription
 * implicitly creating an offer/answer, and the events that trigger both.
 */
export class FakeTrack {
  enabled = true;
  stopped = false;
  constructor(public kind: 'audio' | 'video') {}
  stop() { this.stopped = true; }
}

export class FakeStream {
  constructor(public tracks: FakeTrack[]) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
}

export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  signalingState = 'stable';
  connectionState = 'new';
  localDescription: any = null;
  remoteDescription: any = null;
  addedCandidates: any[] = [];
  closed = false;
  addedTracks: FakeTrack[] = [];
  ontrack: any = null;
  onicecandidate: any = null;
  onconnectionstatechange: any = null;
  onnegotiationneeded: any = null;
  /** setLocalDescription throws when set — models a rollback failure. */
  failLocalDescription = false;

  constructor(public config: any) { FakePeerConnection.instances.push(this); }

  addTrack(t: FakeTrack) { this.addedTracks.push(t); }

  async setLocalDescription(desc?: any) {
    if (this.failLocalDescription) throw new Error('setLocalDescription failed');
    // Mirrors the real implicit behaviour: an answer when we hold a remote
    // offer, otherwise an offer.
    const type = desc?.type ?? (this.signalingState === 'have-remote-offer' ? 'answer' : 'offer');
    // Real session descriptions carry toJSON; CallPeer relies on it.
    const sdp = `local-${type}`;
    this.localDescription = { type, sdp, toJSON: () => ({ type, sdp }) };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
    return undefined;
  }

  async setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
    return undefined;
  }

  async addIceCandidate(c: any) { this.addedCandidates.push(c); }
  close() { this.closed = true; }

  // ── test drivers ──
  emitIce(candidate: any) { this.onicecandidate?.({ candidate: { toJSON: () => candidate } }); }
  emitTrack(stream: any) { this.ontrack?.({ streams: [stream] }); }
  setConnectionState(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); }
  async fireNegotiationNeeded() { await this.onnegotiationneeded?.(); }
}

export function installFakeRtc(opts: { failMedia?: string } = {}) {
  FakePeerConnection.instances = [];
  const g = globalThis as any;
  g.RTCPeerConnection = FakePeerConnection;
  // navigator is a getter-only global in Node, so define rather than assign.
  Object.defineProperty(g, 'navigator', {
    configurable: true,
    writable: true,
    value: {
    mediaDevices: {
      getUserMedia: async ({ video }: any) => {
        if (opts.failMedia) {
          const e = new Error('denied');
          e.name = opts.failMedia;
          throw e;
        }
        const tracks = [new FakeTrack('audio')];
        if (video) tracks.push(new FakeTrack('video'));
        return new FakeStream(tracks);
      },
    },
    },
  });
}
