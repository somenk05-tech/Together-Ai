import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { socketClient, WS, useConversations } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { callsApi, isCall, type Call, type CallType, type IceConfig } from './api';
import { CallPeer, type SignalKind } from './peer';
import { callRinger } from './ring';
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
/**
 * The one other person on this call — chosen the same way by both ends.
 *
 * It was `find(p => p.userId !== meId)` over a Prisma include with no ordering,
 * computed independently on each side, while every frame this component sends
 * is addressed to that one id. On a three-person call A could answer B and send
 * the answer to C, and neither of them would ever hear anything. The rule below
 * needs no round trip and cannot disagree: the person who started the call is
 * one end of it, and the end they are talking to is whoever answered first.
 *
 * That is one PAIR, which is all this component has ever supported — see the
 * note above. A third participant is connected to nobody, and is told so.
 */
function otherParticipant(call: Call, meId: string): string | null {
  const others = call.participants.filter((p) => p.userId !== meId && !p.leftAt);
  if (!others.length) return null;
  // Everybody who answers talks to the caller…
  if (call.createdById !== meId) {
    return others.some((p) => p.userId === call.createdById) ? call.createdById : null;
  }
  // …and the caller talks to the first person who answered. The id breaks a
  // tie, so two answers in the same millisecond still name one person twice.
  const answered = others.filter((p) => p.joinedAt !== null);
  answered.sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') || a.userId.localeCompare(b.userId));
  return answered[0]?.userId ?? null;
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
  const [sharing, setSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const peerRef = useRef<CallPeer | null>(null);
  /** The phase as an effect can read it without re-subscribing per change. */
  const phaseRef = useRef<CallPhase>('idle');
  phaseRef.current = phase;
  /** The call in progress, for the same reason — and it is what every arriving
   *  frame is checked against, so it must be the current one, not the one the
   *  socket listener happened to close over. */
  const callRef = useRef<Call | null>(null);
  callRef.current = call;
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
    setSharing(false);
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
    // Honest about the scope stated above: with three people on a call, one
    // pair can hear each other and nobody else can hear anything.
    if (c.participants.filter((p) => !p.leftAt).length > 2) {
      setProblem('Group calls aren’t built yet — only two people on this call can hear each other.');
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
        // A late frame from a connection we have already replaced or closed
        // must not touch the call that replaced it.
        if (peerRef.current !== peer) return;
        if (state === 'connected') { setPhase('connected'); return; }
        /* A CONNECTION THAT DROPS IS NOT A CONNECTION. Only 'connected' was
           handled, so 'disconnected', 'failed' and 'closed' changed nothing:
           the dialog went on saying the call was in progress, the clock went
           on counting, and the microphone stayed open on a call that had
           already died. 'disconnected' is often a few seconds of a bad
           network and ICE recovers from it, so it goes back to Connecting —
           where the timer below gives it a minute and then gives up. */
        if (state === 'disconnected') {
          setPhase((p) => (p === 'connected' ? 'connecting' : p));
          return;
        }
        if (state === 'failed' || state === 'closed') {
          setProblem((prev) => prev ?? 'The connection dropped.');
          teardown();
          void callsApi.leave(c.id).catch(() => undefined);
        }
      },
      onFailure: (message) => setProblem(message),
      onScreenShare: (on) => {
        setSharing(on);
        // The self-view shows what is being SENT. A preview showing your face
        // while the other person watches your screen is a preview lying —
        // and it runs through this callback (not the button handler) so the
        // browser's own "Stop sharing" chrome swaps it back too.
        if (localVideo.current) {
          localVideo.current.srcObject = on
            ? (peerRef.current?.screenStream ?? null)
            : (peerRef.current?.localStream ?? null);
        }
      },
    });
    peerRef.current = peer;

    try {
      await peer.start();
    } catch {
      // start() has already explained itself through onFailure. Leave the call
      // so the other person is not left listening to nothing.
      connecting.current = false;
      /* BUT ONLY IF WE ARE IN IT. This ran on any client that got here,
         including a second device of the callee that had built a peer off the
         same 'joined' broadcast, met its own microphone prompt and been
         refused — and a leave from that device ended the call the OTHER device
         had just answered, because a two-person call ends when one side
         leaves. Our own row says whether this is our call to hang up. */
      const mine = c.participants.find((p) => p.userId === meId);
      if (mine?.joinedAt && !mine.leftAt) await callsApi.leave(c.id).catch(() => undefined);
      teardown();
      return;
    }
    connecting.current = false;
    if (localVideo.current && peer.localStream) localVideo.current.srcObject = peer.localStream;
    setPhase('connecting');
    for (const s of early.current.splice(0)) await peer.receive(s.kind, s.payload).catch(() => undefined);
  }, [meId, teardown]);

  // ── socket wiring ────────────────────────────────────

  useEffect(() => {
    const offRinging = socketClient.on<unknown>(WS.CALL_RINGING, (frame) => {
      // A frame that is not a call is not a call. See isCall — this is the
      // socket half of the "INCOMING UNDEFINED CALL" fix.
      if (!isCall(frame)) return;
      const incoming = frame;
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
      /* EVERY FRAME FOR EVERY CALL YOU ARE ON THE ROSTER OF ARRIVES HERE, and
         this read the event without ever reading the id. `setCall` knew that
         and ignored a frame for another call; the branches underneath did not.
         So a stale call — one you ignored an hour ago, closed now by the
         server's sweep — arrived as `ended` and tore down the call you were
         actually on. And because a teardown is local, your own leave never
         went out: the other person's row stayed live and their screen stayed
         on a call that had nobody in it. One comparison, before every branch. */
      const current = callRef.current;
      if (!current || updated.id !== current.id) return;
      setCall(updated);
      if (event === 'ended') {
        teardown();
        return;
      }
      // Someone answered: if we are the caller, that is our cue to connect.
      if (event === 'joined' && updated.status === 'active') {
        /* ONLY IF THIS CLIENT IS IN THE CALL, AND ANSWERED IT HERE.
           Every tab and every device on the roster built its own peer
           connection off this one broadcast, guarded by nothing but a per-tab
           flag. Two tabs of the caller pushed two interleaved offers into one
           connection and negotiation never completed; the callee's second
           device opened a microphone prompt for a call it had never answered.
           A tab still showing the ringing sheet has not answered — whatever
           another device of the same citizen has just done. */
        if (phaseRef.current === 'incoming') return;
        const mine = updated.participants.find((p) => p.userId === meId);
        if (!mine?.joinedAt || mine.leftAt) return;
        setPhase((p) => (p === 'connected' ? p : 'connecting'));
        void connectPeer(updated);
      }
    });

    const offSignal = socketClient.on<{ callId: string; from: string; kind: SignalKind; payload: unknown }>(
      WS.CALL_SIGNAL,
      (frame) => {
        /* BOTH `callId` AND `from` WERE RECEIVED AND THROWN AWAY — here and in
           peer.ts, which checks neither. A frame naming a different call was
           applied to this one, and the buffer below was filled while the app
           was idle and replayed into whatever connection happened to be built
           next: a candidate from a call you declined, pushed into the call you
           took afterwards. A signal is ours only if it names the call in
           progress and comes from the person that call says we are talking to. */
        const current = callRef.current;
        if (!current || frame.callId !== current.id) return;
        const peer = peerRef.current;
        if (!peer) {
          // Nothing to give it to yet — the caller's offer routinely beats our
          // own join. Held only for the person we are about to be talking to.
          if (frame.from !== otherParticipant(current, meId)) return;
          early.current.push({ kind: frame.kind, payload: frame.payload });
          return;
        }
        if (frame.from !== peer.remoteId) return;
        void peer.receive(frame.kind, frame.payload).catch(() => undefined);
      },
    );

    /* NOTHING IN THE CALL PATH LISTENED FOR `error_event`. Every refusal the
       signalling handler makes — an ended call, a member since removed, a
       block, the new ceiling — arrived here, was read by the CHAT client as
       one of its messages failing, and said nothing whatsoever about the call,
       which went on saying "Connecting…" until it timed out. The gateway names
       the kind now; this is the half that shows it to the person waiting. */
    const offError = socketClient.on<{ kind?: string; message?: string }>(WS.ERROR, (e) => {
      if (e?.kind !== 'call' || phaseRef.current === 'idle') return;
      setProblem(e.message || 'That call could not be connected.');
    });

    return () => { offRinging(); offUpdated(); offSignal(); offError(); };
  }, [meId, phase, connectPeer, teardown]);

  /**
   * Ring recovery. The CALL_RINGING frame only reaches tabs alive at the
   * instant it is emitted — a receiver who opens the app from the push
   * notification, reloads, or whose phone wakes a suspended tab arrives
   * AFTER it, and without this their phone is ringing everywhere except on
   * the screen in their hand. So ask the server "is anything ringing for
   * me?" at the three moments a tab (re)joins the world: mount, socket
   * reconnect, and the tab becoming visible again.
   */
  useEffect(() => {
    let cancelled = false;
    const recover = () => {
      if (peerRef.current || phaseRef.current !== 'idle') return; // already busy
      void callsApi.ringing().then((ringing) => {
        // `ringing()` is the other unvalidated door: a 200 carrying an HTML
        // error page is truthy, and truthy was the whole guard.
        if (cancelled || !isCall(ringing) || peerRef.current || phaseRef.current !== 'idle') return;
        setProblem(null);
        setCall(ringing);
        setPhase('incoming');
      }).catch(() => undefined);
    };
    recover();
    const s = socketClient.raw();
    s.on('connect', recover);
    const onVisible = () => { if (document.visibilityState === 'visible') recover(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      s.off('connect', recover);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A call that connected counts its own time, so the label agrees with what
  // the history will say afterwards.
  useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // The sound of the call: ring while it is incoming, ringback while it is
  // outgoing, silence the moment either side acts. Driven by phase — the same
  // truth every other part of this dialog renders from — so the sound can
  // never keep ringing after the screen says the call is over. Best-effort:
  // a browser that refuses audio before a user gesture rings silently, which
  // is exactly the behaviour this replaced.
  useEffect(() => {
    if (phase === 'incoming') callRinger.start('ring');
    else if (phase === 'outgoing') callRinger.start('ringback');
    else callRinger.stop();
    return () => callRinger.stop();
  }, [phase]);

  // Never leave a ringing sheet on screen forever. The server's sweep closes an
  // unanswered call within about a minute; this matches it so the UI does not
  // sit lying about a call that is over.
  useEffect(() => {
    if (phase !== 'incoming' && phase !== 'outgoing') return;
    const t = setTimeout(() => { if (!peerRef.current) teardown(); }, 60_000);
    return () => clearTimeout(t);
  }, [phase, teardown]);

  /* Releasing the camera and microphone is not optional on unmount — and
     neither is telling the server. A tab that went away mid-call sent nothing
     at all: the row stayed `active` with everybody still marked present, the
     sweep skipped it on that strength every minute forever, and the next call
     in that conversation joined the corpse instead of ringing anyone. The
     socket's own disconnect is the guarantee (ChatGateway.handleDisconnect);
     this is the half that fires while the page can still make the request, so
     the other side stops waiting now rather than twenty seconds from now.
     A RINGING sheet is not left behind: this phone may be ringing on three
     devices, and closing one of them is not a decline. */
  useEffect(() => {
    const drop = () => {
      const id = callRef.current?.id;
      peerRef.current?.close();
      peerRef.current = null;
      if (id && phaseRef.current !== 'incoming') void callsApi.leave(id).catch(() => undefined);
    };
    window.addEventListener('pagehide', drop);
    return () => { window.removeEventListener('pagehide', drop); drop(); };
  }, []);

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
    } catch (e) {
      // try/finally with no catch: every refusal this endpoint makes — a block,
      // an unmatch, a conversation you are no longer in, an avatar that is not
      // yours — was an unhandled rejection and a key that did nothing.
      setProblem(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'That call could not be started.',
      );
      teardown();
    } finally {
      setBusy(false);
    }
  }, [connectPeer, teardown]);

  /* WHAT A NOTIFICATION LINK RESOLVES TO. `notifyIncomingCall` has written
     `?call=<id>` into the push url since it was added, and a spec asserted the
     url was present — but the spec asserted on server source and there was no
     consumer anywhere in the client, so tapping a ringing notification opened
     the thread and the phone went on ringing. A ring that has already expired
     is refused by the server and says so, which is the honest answer and better
     than the blank thread it used to be. */
  const joinById = useCallback(async (callId: string) => {
    setBusy(true);
    setProblem(null);
    try {
      const joined = await callsApi.join(callId);
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
  }, [connectPeer, teardown]);

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

  const toggleShare = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer) return;
    if (peer.sharingScreen) await peer.stopScreenShare();
    else await peer.shareScreen();
  }, []);

  const hangUp = useCallback(async () => {
    const id = call?.id;
    // Tear down locally first: the citizen pressed a button and the microphone
    // should stop now, not when the network agrees.
    teardown();
    if (id) await callsApi.leave(id).catch(() => undefined);
  }, [call, teardown]);

  /* NOTHING EVER TIMED OUT `connecting`. The net above covers the two ringing
     phases only, so a call that was answered and then failed to negotiate —
     the ordinary outcome when one side is on a network needing a relay we do
     not have — sat on "Connecting…" with the microphone open until the citizen
     closed the tab. It gets the same minute the ringing phases get, and it
     hangs up rather than merely clearing the screen, because the other side is
     sitting in the same silence waiting for this to end. */
  useEffect(() => {
    if (phase !== 'connecting') return;
    const t = setTimeout(() => { void hangUp(); }, 60_000);
    return () => clearTimeout(t);
  }, [phase, hangUp]);

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

  const value = useMemo<CallCenterValue>(() => ({ phase, call, start, joinById, busy }), [phase, call, start, joinById, busy]);

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
            /* 10500, NOT 4000. At 4000 an incoming call rendered UNDERNEATH
               the chat forward/group panels (9500) and cook mode (9998/9999)
               — and forwarding a message or cooking with a timer running is
               exactly when a call lands. A ringing call is the one surface
               with a person waiting on the other end; nothing outranks it. */
            position: 'fixed', inset: 0, zIndex: 10500, display: 'grid', placeItems: 'center',
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
                  style={{ width: '100%', borderRadius: 12, background: 'var(--media-bg)', aspectRatio: '4 / 3' }}
                />
                <video
                  ref={localVideo} autoPlay playsInline muted
                  aria-label="Your camera"
                  style={{
                    position: 'absolute', right: 10, bottom: 10, width: 92, borderRadius: 8,
                    background: 'var(--media-bg)', border: '1px solid rgba(255,255,255,.35)',
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
                fontSize: 12.5, lineHeight: 1.5, color: 'var(--danger-ink)',
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
                  {/* Video calls only: the screen rides the video sender via
                      replaceTrack, so nothing is renegotiated — and on an audio
                      call the far side draws no surface to watch it on. */}
                  {showVideo && phase === 'connected' && (
                    <button
                      className="btn btn-line"
                      aria-pressed={sharing}
                      onClick={() => void toggleShare()}
                    >
                      {sharing ? 'Stop sharing' : 'Share screen'}
                    </button>
                  )}
                  <button
                    ref={primaryAction}
                    className="btn btn-line"
                    style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
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
