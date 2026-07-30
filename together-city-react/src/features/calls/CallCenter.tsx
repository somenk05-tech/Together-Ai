import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { socketClient, WS, useConversations } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { callsApi, type Call, type CallType, type IceConfig } from './api';
import { CallPeer, type SignalKind } from './peer';
import { CallCenterContext, type CallCenterValue, type CallPhase } from './context';

/**
 * The one place in the app that knows a call is happening.
 *
 * It lives above the router rather than inside a chat screen, because a call
 * has to survive navigating away from the conversation it started in — and
 * because an incoming call has to appear wherever the citizen happens to be.
 *
 * Scope, stated rather than implied: this drives ONE-TO-ONE calls. The backend
 * roster supports more, but a group call needs a mesh of peer connections (or
 * an SFU) and pretending otherwise would mean a third person joining and
 * hearing nothing. With three people on a call, this connects to the first
 * other participant and says so.
 */
/** The other person on a one-to-one call, from our point of view. */
function otherParticipant(call: Call, meId: string): string | null {
  return call.participants.find((p) => p.userId !== meId)?.userId ?? null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CallCenter({ children }: { children: ReactNode }) {
  const meId = useAuthStore((s) => s.user?.id ?? '');
  const conversations = useConversations();

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const peerRef = useRef<CallPeer | null>(null);
  /**
   * Set synchronously, before the first await in connectPeer.
   *
   * peerRef alone is not enough to guard against building two connections:
   * answering a call calls connectPeer directly, and the server's 'joined'
   * broadcast arrives and calls it again — both get past a peerRef check
   * because peerRef is only assigned after an awaited fetch of the ICE
   * config. Two peer connections to the same person negotiate against each
   * other and neither completes.
   */
  const connecting = useRef(false);
  const iceRef = useRef<IceConfig | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryAction = useRef<HTMLButtonElement | null>(null);
  /** Whatever had focus before the call took over the screen. */
  const focusBefore = useRef<Element | null>(null);
  // Signals can arrive before the peer exists (the offer racing our join).
  const early = useRef<Array<{ kind: SignalKind; payload: unknown }>>([]);

  /** Whatever the chat list calls this conversation — which is already the
   *  right name under dating anonymity, because the list computes it that way.
   *  Never guessed: an unknown conversation stays unnamed rather than being
   *  labelled with something that might be a real name behind a nickname. */
  const callerLabel = useMemo(() => {
    if (!call) return 'Someone';
    const convo = conversations.data?.find((c) => c.id === call.conversationId);
    return convo?.title?.trim() || 'Someone';
  }, [call, conversations.data]);

  const teardown = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    connecting.current = false;
    early.current = [];
    setPhase('idle');
    setCall(null);
    setMuted(false);
    setCameraOff(false);
    setSeconds(0);
  }, []);

  /** Bring up the media connection to the other person. */
  const connectPeer = useCallback(async (c: Call) => {
    if (peerRef.current || connecting.current) return;
    const peerId = otherParticipant(c, meId);
    if (!peerId) return;
    connecting.current = true;

    iceRef.current ??= await callsApi.ice().catch(() => null);
    const ice = iceRef.current;
    if (ice && !ice.relayAvailable) {
      // Say it before the silence, not after.
      setProblem(ice.note);
    }

    const peer = new CallPeer({
      callId: c.id,
      peerId,
      iceServers: ice?.iceServers ?? [],
      // The person who started the call is impolite; the other yields. Both
      // sides derive this from the same field, so no round trip is needed.
      polite: c.createdById !== meId,
      wantsVideo: c.type !== 'audio',
      send: (signal) => socketClient.emit(WS.CALL_SIGNAL, signal),
      onRemoteStream: (stream) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = stream;
        if (remoteAudio.current) remoteAudio.current.srcObject = stream;
      },
      onStateChange: (state) => {
        if (state === 'connected') setPhase('connected');
      },
      onFailure: (message) => setProblem(message),
    });
    peerRef.current = peer;

    try {
      await peer.start();
    } catch {
      // start() has already explained itself through onFailure. Leave the call
      // so the other person is not left listening to nothing.
      connecting.current = false;
      await callsApi.leave(c.id).catch(() => undefined);
      teardown();
      return;
    }
    connecting.current = false;
    if (localVideo.current && peer.localStream) localVideo.current.srcObject = peer.localStream;
    setPhase('connecting');
    for (const s of early.current.splice(0)) await peer.receive(s.kind, s.payload);
  }, [meId, teardown]);

  // ── socket wiring ────────────────────────────────────

  useEffect(() => {
    const offRinging = socketClient.on<Call>(WS.CALL_RINGING, (incoming) => {
      // Our own outgoing call is not an incoming one.
      if (incoming.createdById === meId) return;
      // One call at a time: a second ring while we are talking is ignored here
      // rather than silently replacing the call in progress.
      if (peerRef.current || phase === 'connected') return;
      setProblem(null);
      setCall(incoming);
      setPhase('incoming');
    });

    const offUpdated = socketClient.on<{ event: string; call: Call }>(WS.CALL_UPDATED, ({ event, call: updated }) => {
      setCall((prev) => (prev && prev.id !== updated.id ? prev : updated));
      if (event === 'ended') {
        teardown();
        return;
      }
      // Someone answered: if we are the caller, that is our cue to connect.
      if (event === 'joined' && updated.status === 'active') {
        setPhase((p) => (p === 'incoming' ? p : 'connecting'));
        void connectPeer(updated);
      }
    });

    const offSignal = socketClient.on<{ callId: string; from: string; kind: SignalKind; payload: unknown }>(
      WS.CALL_SIGNAL,
      (frame) => {
        const peer = peerRef.current;
        if (!peer) {
          early.current.push({ kind: frame.kind, payload: frame.payload });
          return;
        }
        void peer.receive(frame.kind, frame.payload);
      },
    );

    return () => { offRinging(); offUpdated(); offSignal(); };
  }, [meId, phase, connectPeer, teardown]);

  // A call that connected counts its own time, so the label agrees with what
  // the history will say afterwards.
  useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Never leave a ringing sheet on screen forever. The server's sweep closes an
  // unanswered call within about a minute; this matches it so the UI does not
  // sit lying about a call that is over.
  useEffect(() => {
    if (phase !== 'incoming' && phase !== 'outgoing') return;
    const t = setTimeout(() => { if (!peerRef.current) teardown(); }, 60_000);
    return () => clearTimeout(t);
  }, [phase, teardown]);

  // Releasing the camera and microphone is not optional on unmount.
  useEffect(() => () => { peerRef.current?.close(); }, []);

  // ── keyboard and focus ───────────────────────────────

  /**
   * A call is the one thing in this app that appears without being asked for,
   * which makes it the one place where losing the keyboard matters most: a
   * ringing dialog nobody can reach is a call a person cannot answer.
   *
   * So when it opens, focus moves to the action they most likely want — Answer
   * while ringing, Hang up once talking — and is put back where it was when the
   * call ends, rather than dumped at the top of the document.
   */
  const isOpen = phase !== 'idle';
  const isRinging = phase === 'incoming';

  useEffect(() => {
    if (!isOpen) {
      const previous = focusBefore.current as HTMLElement | null;
      focusBefore.current = null;
      previous?.focus?.();
      return;
    }
    focusBefore.current ??= document.activeElement;
    // After the dialog has painted, so the button exists to receive focus.
    const t = setTimeout(() => primaryAction.current?.focus(), 0);
    return () => clearTimeout(t);
    // Deliberately keyed on these two rather than on `phase`. Moving focus on
    // every phase change would snatch it back from Mute the moment a call goes
    // from connecting to connected. But when a ringing call is answered, the
    // Answer button is unmounted and replaced by Hang up — focus would be lost
    // to the document body if it did not follow. `isRinging` flips exactly
    // when that swap happens, and at no other time.
  }, [isOpen, isRinging]);

  // ── actions ──────────────────────────────────────────

  const start = useCallback(async (conversationId: string, type: CallType) => {
    setBusy(true);
    setProblem(null);
    try {
      const started = await callsApi.start(conversationId, type);
      setCall(started);
      // start() may have joined a call that was already ringing, in which case
      // it is active already and there is nobody left to wait for.
      if (started.status === 'active') {
        setPhase('connecting');
        await connectPeer(started);
      } else {
        setPhase('outgoing');
      }
    } finally {
      setBusy(false);
    }
  }, [connectPeer]);

  const answer = useCallback(async () => {
    if (!call) return;
    setBusy(true);
    try {
      const joined = await callsApi.join(call.id);
      setCall(joined);
      setPhase('connecting');
      await connectPeer(joined);
    } catch (e) {
      setProblem(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'That call is no longer available.',
      );
      teardown();
    } finally {
      setBusy(false);
    }
  }, [call, connectPeer, teardown]);

  const hangUp = useCallback(async () => {
    const id = call?.id;
    // Tear down locally first: the citizen pressed a button and the microphone
    // should stop now, not when the network agrees.
    teardown();
    if (id) await callsApi.leave(id).catch(() => undefined);
  }, [call, teardown]);

  /**
   * Keep Tab inside the dialog, and let Escape decline a ringing call.
   *
   * Escape deliberately does NOT hang up a call in progress. Dismissing a
   * dialog with Escape is the convention, but this dialog is a conversation
   * with another person — ending one by brushing a key is a worse failure than
   * having to reach for the button.
   */
  useEffect(() => {
    if (phase === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'incoming' || phase === 'outgoing')) {
        e.preventDefault();
        void hangUp();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>('button, [href], video[controls], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped entirely.
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, hangUp]);

  const value = useMemo<CallCenterValue>(() => ({ phase, call, start, busy }), [phase, call, start, busy]);

  const showVideo = call?.type !== 'audio';

  return (
    <CallCenterContext.Provider value={value}>
      {children}

      {/* Audio always plays, even on an audio-only call where no video renders. */}
      <audio ref={remoteAudio} autoPlay playsInline style={{ display: 'none' }} />

      {phase !== 'idle' && call && (
        <div
          ref={dialogRef}
          // alertdialog while it is ringing: a call demands attention rather
          // than merely offering it, and assistive tech treats the two
          // differently. aria-modal keeps the page behind it out of the
          // reading order, which is the whole point of a call taking over.
          role={phase === 'incoming' ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="tc-call-who"
          aria-describedby="tc-call-status"
          style={{
            position: 'fixed', inset: 0, zIndex: 4000, display: 'grid', placeItems: 'center',
            background: 'rgba(12,14,18,.72)', backdropFilter: 'blur(6px)',
          }}
        >
          <div className="card" style={{ width: 'min(420px, 92vw)', padding: 22, textAlign: 'center' }}>
            <div
              id="tc-call-status"
              className="muted"
              style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}
            >
              {phase === 'incoming' && `Incoming ${call.type === 'audio' ? 'call' : `${call.type} call`}`}
              {phase === 'outgoing' && 'Calling…'}
              {phase === 'connecting' && 'Connecting…'}
              {/* Deliberately NOT in a live region. It changes every second,
                  and a screen reader announcing the clock once a second would
                  make the call unusable. It stays readable on demand. */}
              {phase === 'connected' && (
                <span aria-label={`In call, ${formatDuration(seconds)}`}>{formatDuration(seconds)}</span>
              )}
            </div>
            <h2 id="tc-call-who" style={{ fontSize: 20, margin: '6px 0 14px' }}>{callerLabel}</h2>

            {showVideo && (
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <video
                  ref={remoteVideo} autoPlay playsInline
                  aria-label={`Video from ${callerLabel}`}
                  style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3' }}
                />
                <video
                  ref={localVideo} autoPlay playsInline muted
                  aria-label="Your camera"
                  style={{
                    position: 'absolute', right: 10, bottom: 10, width: 92, borderRadius: 8,
                    background: '#000', border: '1px solid rgba(255,255,255,.35)',
                  }}
                />
              </div>
            )}

            {/* Announced when it appears — a failed call with a silent
                explanation is the same as no explanation. */}
            <p
              role="status"
              aria-live="polite"
              style={{
                fontSize: 12.5, lineHeight: 1.5, color: '#c62828',
                margin: problem ? '0 0 12px' : 0,
              }}
            >
              {problem}
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {phase === 'incoming' && (
                <>
                  <button ref={primaryAction} className="btn btn-accent" disabled={busy} onClick={() => void answer()}>Answer</button>
                  <button className="btn btn-line" disabled={busy} onClick={() => void hangUp()}>Decline</button>
                </>
              )}
              {phase !== 'incoming' && (
                <>
                  <button
                    className="btn btn-line"
                    aria-pressed={muted}
                    onClick={() => setMuted(peerRef.current?.toggleMute() ?? false)}
                  >
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  {showVideo && (
                    <button
                      className="btn btn-line"
                      aria-pressed={cameraOff}
                      onClick={() => setCameraOff(peerRef.current?.toggleCamera() ?? true)}
                    >
                      {cameraOff ? 'Camera on' : 'Camera off'}
                    </button>
                  )}
                  <button
                    ref={primaryAction}
                    className="btn btn-line"
                    style={{ color: '#c62828', borderColor: '#f0b0b0' }}
                    onClick={() => void hangUp()}
                  >
                    Hang up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </CallCenterContext.Provider>
  );
}
