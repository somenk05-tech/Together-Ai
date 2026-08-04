import { beforeEach, describe, expect, it } from 'vitest';
import { CallPeer, type OutboundSignal } from './peer';
import { FakePeerConnection, FakeStream, FakeTrack, installFakeRtc } from './fake-rtc';

/**
 * The negotiation, tested without two browsers.
 *
 * A call that rings and then sits in silence is almost always one of the paths
 * below, and every one of them is awkward to reproduce by hand: both sides
 * offering in the same instant, a candidate arriving before the answer, a
 * refused microphone. They are cheap here.
 */
function build(over: Partial<Parameters<typeof makeOpts>[0]> = {}) {
  const sent: OutboundSignal[] = [];
  const failures: string[] = [];
  const states: string[] = [];
  let remote: unknown = null;
  const opts = makeOpts({
    send: (s) => sent.push(s),
    onRemoteStream: (s) => { remote = s; },
    onStateChange: (s) => states.push(s),
    onFailure: (m) => failures.push(m),
    ...over,
  });
  const peer = new CallPeer(opts);
  return { peer, sent, failures, states, get remote() { return remote; } };
}

function makeOpts(o: Partial<ConstructorParameters<typeof CallPeer>[0]>) {
  return {
    callId: 'call-1',
    peerId: 'them',
    iceServers: [{ urls: ['stun:example:3478'] }],
    polite: false,
    wantsVideo: false,
    send: () => {},
    onRemoteStream: () => {},
    onStateChange: () => {},
    onFailure: () => {},
    ...o,
  } as ConstructorParameters<typeof CallPeer>[0];
}

const pc = () => FakePeerConnection.instances.at(-1)!;

beforeEach(() => installFakeRtc());

describe('opening the connection', () => {
  it('asks for the microphone before signalling anything', async () => {
    const { peer, sent } = build();
    await peer.start();
    expect(peer.localStream).toBeTruthy();
    // Nothing may go out before media exists: a refused permission after an
    // offer leaves the other person watching a call that connected to silence.
    expect(sent).toEqual([]);
  });

  it('adds a video track only for a video call', async () => {
    const audio = build();
    await audio.peer.start();
    expect(pc().addedTracks.map((t) => t.kind)).toEqual(['audio']);

    const video = build({ wantsVideo: true });
    await video.peer.start();
    expect(pc().addedTracks.map((t) => t.kind)).toEqual(['audio', 'video']);
  });

  it('explains a blocked microphone in words a citizen can act on', async () => {
    installFakeRtc({ failMedia: 'NotAllowedError' });
    const { peer, failures } = build();
    await expect(peer.start()).rejects.toThrow();
    expect(failures[0]).toMatch(/blocked access to the microphone/i);
  });

  it('distinguishes no microphone from a refused one', async () => {
    installFakeRtc({ failMedia: 'NotFoundError' });
    const { peer, failures } = build();
    await expect(peer.start()).rejects.toThrow();
    expect(failures[0]).toMatch(/No microphone was found/i);
  });
});

describe('the handshake', () => {
  it('sends an offer when negotiation is needed', async () => {
    const { peer, sent } = build();
    await peer.start();
    await pc().fireNegotiationNeeded();
    expect(sent.map((s) => s.kind)).toEqual(['offer']);
    expect(sent[0]).toMatchObject({ callId: 'call-1', to: 'them' });
  });

  it('answers an offer it receives', async () => {
    const { peer, sent } = build();
    await peer.start();
    await peer.receive('offer', { type: 'offer', sdp: 'theirs' });
    expect(sent.map((s) => s.kind)).toEqual(['answer']);
  });

  it('does not answer an answer', async () => {
    const { peer, sent } = build();
    await peer.start();
    await peer.receive('answer', { type: 'answer', sdp: 'theirs' });
    expect(sent).toEqual([]);
  });

  it('trickles its own candidates to the other side', async () => {
    const { peer, sent } = build();
    await peer.start();
    pc().emitIce({ candidate: 'a' });
    expect(sent).toEqual([{ callId: 'call-1', to: 'them', kind: 'ice', payload: { candidate: 'a' } }]);
  });
});

describe('candidates that arrive too early', () => {
  it('holds them until there is a remote description, then applies them', async () => {
    const { peer } = build();
    await peer.start();
    // Candidates routinely beat the answer over a real signalling channel.
    await peer.receive('ice', { candidate: 'early-1' });
    await peer.receive('ice', { candidate: 'early-2' });
    expect(pc().addedCandidates).toEqual([]);

    await peer.receive('answer', { type: 'answer', sdp: 'theirs' });
    expect(pc().addedCandidates).toEqual([{ candidate: 'early-1' }, { candidate: 'early-2' }]);
  });

  it('does not replay them a second time', async () => {
    const { peer } = build();
    await peer.start();
    await peer.receive('ice', { candidate: 'early' });
    await peer.receive('answer', { type: 'answer', sdp: 'a' });
    await peer.receive('offer', { type: 'offer', sdp: 'b' });
    expect(pc().addedCandidates).toEqual([{ candidate: 'early' }]);
  });
});

describe('glare — both sides offering at once', () => {
  it('the impolite side ignores the competing offer', async () => {
    const { peer, sent } = build({ polite: false });
    await peer.start();
    await pc().fireNegotiationNeeded();          // we now hold a local offer
    sent.length = 0;
    await peer.receive('offer', { type: 'offer', sdp: 'theirs' });
    // Ignored: no answer, and our own offer stands.
    expect(sent).toEqual([]);
    expect(pc().remoteDescription).toBeNull();
  });

  it('the polite side yields and answers', async () => {
    const { peer, sent } = build({ polite: true });
    await peer.start();
    await pc().fireNegotiationNeeded();
    sent.length = 0;
    await peer.receive('offer', { type: 'offer', sdp: 'theirs' });
    expect(sent.map((s) => s.kind)).toEqual(['answer']);
    expect(pc().remoteDescription).toMatchObject({ sdp: 'theirs' });
  });

  it('two peers with the same politeness would deadlock — which is why it is derived', async () => {
    // Both impolite: each ignores the other and neither connection completes.
    // This is the failure the caller/callee rule exists to make impossible.
    const a = build({ polite: false });
    const b = build({ polite: false });
    await a.peer.start();
    const pcA = pc();
    await b.peer.start();
    const pcB = pc();
    await pcA.fireNegotiationNeeded();
    await pcB.fireNegotiationNeeded();
    a.sent.length = 0; b.sent.length = 0;
    await a.peer.receive('offer', { type: 'offer', sdp: 'from-b' });
    await b.peer.receive('offer', { type: 'offer', sdp: 'from-a' });
    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual([]);
  });

  it('one impolite and one polite peer complete the handshake', async () => {
    const caller = build({ polite: false });
    await caller.peer.start();
    const pcCaller = pc();
    const callee = build({ polite: true });
    await callee.peer.start();
    const pcCallee = pc();

    await pcCaller.fireNegotiationNeeded();
    await pcCallee.fireNegotiationNeeded();      // simultaneous
    const callerOffer = caller.sent.find((s) => s.kind === 'offer')!;
    callee.sent.length = 0;

    await callee.peer.receive('offer', callerOffer.payload);
    const answer = callee.sent.find((s) => s.kind === 'answer');
    expect(answer).toBeTruthy();

    await caller.peer.receive('answer', answer!.payload);
    expect(pcCaller.remoteDescription).toMatchObject({ type: 'answer' });
    expect(pcCallee.remoteDescription).toMatchObject({ type: 'offer' });
  });
});

describe('what the citizen is told', () => {
  it('reports connection state upward', async () => {
    const { peer, states } = build();
    await peer.start();
    pc().setConnectionState('connected');
    expect(states).toContain('connected');
  });

  it('blames the missing relay when the connection fails, because it usually is', async () => {
    const { peer, failures } = build();
    await peer.start();
    pc().setConnectionState('failed');
    expect(failures[0]).toMatch(/relay server/i);
  });

  it('hands the remote stream out once it arrives', async () => {
    const h = build();
    await h.peer.start();
    const stream = new FakeStream([]);
    pc().emitTrack(stream);
    expect(h.remote).toBe(stream);
  });
});

describe('mute, camera and hanging up', () => {
  it('toggles the microphone and reports the muted state', async () => {
    const { peer } = build();
    await peer.start();
    expect(peer.toggleMute()).toBe(true);
    expect(peer.localStream!.getAudioTracks()[0].enabled).toBe(false);
    expect(peer.toggleMute()).toBe(false);
  });

  it('reports the camera as off when there is no camera at all', async () => {
    const { peer } = build();          // audio-only
    await peer.start();
    expect(peer.toggleCamera()).toBe(true);
  });

  it('stops every track on close, so no camera light is left on', async () => {
    const { peer } = build({ wantsVideo: true });
    await peer.start();
    const tracks = peer.localStream!.getTracks();
    peer.close();
    expect(tracks.every((t) => (t as unknown as { stopped: boolean }).stopped)).toBe(true);
    expect(pc().closed).toBe(true);
    expect(peer.localStream).toBeNull();
  });

  it('goes quiet after close instead of signalling into a dead call', async () => {
    const { peer, sent } = build();
    await peer.start();
    const connection = pc();
    peer.close();
    connection.emitIce({ candidate: 'late' });
    await peer.receive('offer', { type: 'offer', sdp: 'late' });
    expect(sent).toEqual([]);
  });
});

describe('signals that arrive while the microphone prompt is still open', () => {
  it('does not drop an offer that beats start() finishing', async () => {
    // The real sequence: CallCenter assigns peerRef BEFORE awaiting start(),
    // and start() awaits getUserMedia — which can sit on a permission prompt
    // for as long as the person takes to click Allow. Every frame the caller
    // sends in that window is handed to receive() while there is still no
    // RTCPeerConnection. Dropped, they are never resent: the call rings, both
    // sides look connected, and nobody hears anything.
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true, writable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            await gate;
            return new FakeStream([new FakeTrack('audio')]);
          },
        },
      },
    });

    const { peer, sent } = build({ polite: true });
    const starting = peer.start();
    await peer.receive('offer', { type: 'offer', sdp: 'theirs' });
    await peer.receive('ice', { candidate: 'early' });
    release(null);
    await starting;
    await new Promise((r) => setTimeout(r, 0));

    expect(sent.map((s) => s.kind)).toContain('answer');
    expect(pc().addedCandidates).toEqual([{ candidate: 'early' }]);
  });
});

describe('sharing the screen', () => {
  /**
   * The design constraint every test here leans on: the screen rides the
   * EXISTING video sender via replaceTrack. Same kind, same transceiver — so
   * nothing is signalled, nothing renegotiated, and nothing new for glare to
   * tangle. If a test below ever sees an offer go out during share/stop, the
   * implementation has drifted onto addTrack and these should start failing.
   */
  const videoSender = () => pc().getSenders().find((x) => x.track?.kind === 'video')!;

  async function connected() {
    const built = build({ wantsVideo: true });
    await built.peer.start();
    return built;
  }

  it('puts the screen where the camera was, without renegotiating', async () => {
    const { peer, sent } = await connected();
    expect(await peer.shareScreen()).toBe(true);
    expect((videoSender().track as unknown as FakeTrack).label).toBe('screen');
    expect(peer.sharingScreen).toBe(true);
    // No offer, no answer, no anything: replaceTrack is silent by design.
    expect(sent).toEqual([]);
  });

  it('puts the camera back when sharing stops', async () => {
    const { peer } = await connected();
    await peer.shareScreen();
    const screen = videoSender().track as unknown as FakeTrack;
    await peer.stopScreenShare();
    expect((videoSender().track as unknown as FakeTrack).label).toBe('camera');
    expect(screen.stopped).toBe(true);
    expect(peer.sharingScreen).toBe(false);
  });

  it("restores the camera when the BROWSER's own Stop sharing button is used", async () => {
    // That button lives in the browser chrome, outside the app entirely. The
    // only notice we get is the track ending — miss it and the call keeps
    // sending a frozen last frame while our button still says "Stop sharing".
    const shares: boolean[] = [];
    const built = build({ wantsVideo: true, onScreenShare: (on) => shares.push(on) });
    await built.peer.start();
    await built.peer.shareScreen();
    const screen = videoSender().track as unknown as FakeTrack;
    screen.emitEnded();
    await new Promise((r) => setTimeout(r, 0));
    expect((videoSender().track as unknown as FakeTrack).label).toBe('camera');
    expect(shares).toEqual([true, false]);
  });

  it('treats Cancel on the picker as a decision, not a failure', async () => {
    installFakeRtc({ failDisplay: 'NotAllowedError' });
    const { peer, failures } = await connected();
    expect(await peer.shareScreen()).toBe(false);
    // They pressed Cancel. They know. An error toast would be the app arguing.
    expect(failures).toEqual([]);
    expect((videoSender().track as unknown as FakeTrack).label).toBe('camera');
  });

  it('does say so when the capture genuinely breaks', async () => {
    installFakeRtc({ failDisplay: 'NotReadableError' });
    const { peer, failures } = await connected();
    expect(await peer.shareScreen()).toBe(false);
    expect(failures).toEqual(['Could not start screen sharing on this device.']);
  });

  it('refuses politely on an audio call, where there is no video sender', async () => {
    const { peer, failures } = build();
    await peer.start();
    expect(await peer.shareScreen()).toBe(false);
    expect(failures[0]).toMatch(/video call/);
  });

  it('sharing twice is one share', async () => {
    const { peer } = await connected();
    await peer.shareScreen();
    const first = videoSender().track;
    expect(await peer.shareScreen()).toBe(true);
    expect(videoSender().track).toBe(first);
  });

  it('stopping twice — our button racing the browser chrome — is safe', async () => {
    const { peer } = await connected();
    await peer.shareScreen();
    await Promise.all([peer.stopScreenShare(), peer.stopScreenShare()]);
    expect((videoSender().track as unknown as FakeTrack).label).toBe('camera');
  });

  it('close() stops the screen capture with everything else', async () => {
    // Left running, the browser keeps its "sharing this screen" banner up
    // after the call is gone — a camera-light bug wearing a different hat.
    const { peer } = await connected();
    await peer.shareScreen();
    const screen = peer.screenStream!.getTracks()[0] as unknown as FakeTrack;
    peer.close();
    expect(screen.stopped).toBe(true);
    expect(peer.sharingScreen).toBe(false);
  });
});
