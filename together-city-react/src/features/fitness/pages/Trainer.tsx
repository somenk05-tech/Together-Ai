import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui';
import { useAddWorkout } from '../api';
import { say, sayOnce, stopSpeaking, speechSupported } from '../voice';
import type { PoseLandmark, PoseLandmarker, VisionModule } from '../mediapipe';

/* ────────────────────────────────────────────────────────────────────────
   Trainer Mode — a live, camera-based AI form coach.
   • Webcam via getUserMedia (video never leaves the device).
   • On-device pose detection (MediaPipe Tasks Vision, loaded from CDN).
   • Real-time joint-angle analysis → rep counting + form/posture cues by voice.
   • A guided ~60-minute session (warm-up → work → cool-down).
   Everything degrades gracefully: no camera → permission card; pose lib blocked →
   the timed, voice-guided session still runs.
────────────────────────────────────────────────────────────────────────── */

type Phase = 'warmup' | 'work' | 'cooldown';
type Status = 'idle' | 'starting' | 'live' | 'denied' | 'ended';
const SESSION_MIN = 60;
const PHASES: { key: Phase; label: string; untilMin: number; cue: string }[] = [
  { key: 'warmup', label: 'Warm-up', untilMin: 10, cue: 'Warm-up. Loosen your joints and raise your heart rate gently.' },
  { key: 'work', label: 'Main work', untilMin: 50, cue: 'Main set. Focus on clean reps — I am watching your form.' },
  { key: 'cooldown', label: 'Cool-down', untilMin: 60, cue: 'Cool-down. Slow it down and stretch. Great work today.' },
];

const EXERCISES = [
  { key: 'squat', label: 'Squat', joints: [24, 26, 28] as const, down: 100, up: 160, deepCue: 'Try to sit a little deeper.', upCue: 'Stand tall and squeeze at the top.', postureJoint: 'torso' as const },
  { key: 'pushup', label: 'Push-up', joints: [12, 14, 16] as const, down: 95, up: 155, deepCue: 'Lower your chest closer to the floor.', upCue: 'Full lockout at the top.', postureJoint: 'hipLine' as const },
  { key: 'lunge', label: 'Lunge', joints: [24, 26, 28] as const, down: 105, up: 160, deepCue: 'Drop the back knee toward the floor.', upCue: 'Drive up through the front heel.', postureJoint: 'torso' as const },
];
type Exercise = typeof EXERCISES[number];

const MP_VERSION = '0.10.12';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// angle at point B (degrees) given three landmarks A-B-C
function angle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const abx = a.x - b.x, aby = a.y - b.y, cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}
// torso lean from vertical (shoulder→hip), degrees
function torsoLean(lm: PoseLandmark[]): number {
  const sh = lm[12], hip = lm[24];
  if (!sh || !hip) return 0;
  return (Math.atan2(Math.abs(sh.x - hip.x), Math.abs(sh.y - hip.y)) * 180) / Math.PI;
}

const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

export function Trainer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const repState = useRef<'up' | 'down'>('up');
  const startTs = useRef<number>(0);

  const [status, setStatus] = useState<Status>('idle');
  const [exercise, setExercise] = useState<Exercise>(EXERCISES[0]);
  const exerciseRef = useRef<Exercise>(EXERCISES[0]);
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<Phase>('warmup');
  const [elapsed, setElapsed] = useState(0); // seconds
  const [feedback, setFeedback] = useState('Get in frame — stand back so I can see your whole body.');
  const [poseReady, setPoseReady] = useState(false);
  const [poseError, setPoseError] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const add = useAddWorkout();

  useEffect(() => { exerciseRef.current = exercise; }, [exercise]);
  useEffect(() => { mutedRef.current = muted; if (muted) stopSpeaking(); }, [muted]);

  const speak = useCallback((t: string, once = false) => { if (!mutedRef.current) (once ? sayOnce : say)(t); }, []);

  // session clock
  useEffect(() => {
    if (status !== 'live') return;
    const id = window.setInterval(() => {
      const secs = Math.floor((performance.now() - startTs.current) / 1000);
      setElapsed(secs);
      const mins = secs / 60;
      const ph = PHASES.find((p) => mins < p.untilMin) ?? PHASES[PHASES.length - 1];
      setPhase((prev) => { if (prev !== ph.key) speak(ph.cue); return ph.key; });
      if (mins >= SESSION_MIN) endSession();
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const loadPose = useCallback(async () => {
    try {
      // Typed against the local declaration, not against the real module —
      // see ../mediapipe.ts for why that is a promise rather than a fact.
      const vision = (await import(/* @vite-ignore */ MP_URL)) as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      setPoseReady(true);
    } catch {
      setPoseError(true); // network blocked / unsupported — run as timed voice session
    }
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current, lmk = landmarkerRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx && video.videoWidth) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (lmk) {
        try {
          const res = lmk.detectForVideo(video, performance.now());
          const lm = res?.landmarks?.[0];
          if (lm) {
            drawPose(ctx, lm, canvas.width, canvas.height);
            analyse(lm);
          }
        } catch { /* frame skip */ }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const analyse = (lm: PoseLandmark[]) => {
    const ex = exerciseRef.current;
    const [a, b, c] = ex.joints;
    if (!lm[a] || !lm[b] || !lm[c]) return;
    const ang = angle(lm[a], lm[b], lm[c]);
    // rep state machine: down when below `down`, count on down→up
    if (ang < ex.down && repState.current === 'up') {
      repState.current = 'down';
      // posture check at the bottom
      if (ex.postureJoint === 'torso' && torsoLean(lm) > 42) setFeedbackSpoken('Chest up — keep your torso tall.');
      else setFeedback('Good depth — now drive up.');
    } else if (ang > ex.up && repState.current === 'down') {
      repState.current = 'up';
      setReps((r) => { const n = r + 1; speak(String(n)); return n; });
      setFeedbackSpoken(ex.upCue);
    } else if (ang > ex.down && ang < ex.up && repState.current === 'up') {
      // partial / holding near top — nudge depth occasionally handled by cue below
    }
    if (ang > ex.down + 25 && repState.current === 'up') {
      // hovering shallow
    }
  };

  const setFeedbackSpoken = (t: string) => { setFeedback(t); speak(t, true); };

  const drawPose = (ctx: CanvasRenderingContext2D, lm: PoseLandmark[], w: number, h: number) => {
    ctx.strokeStyle = 'rgba(140,32,60,.9)'; ctx.lineWidth = 4;
    for (const [i, j] of SKELETON) {
      if (lm[i] && lm[j]) { ctx.beginPath(); ctx.moveTo(lm[i].x * w, lm[i].y * h); ctx.lineTo(lm[j].x * w, lm[j].y * h); ctx.stroke(); }
    }
    ctx.fillStyle = 'var(--on-accent)';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2); ctx.fill(); }
  };

  const start = async () => {
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      startTs.current = performance.now();
      setStatus('live'); setElapsed(0); setReps(0); setPhase('warmup');
      speak(`Starting your ${SESSION_MIN}-minute session. ${PHASES[0].cue} We'll begin with ${exerciseRef.current.label}s.`);
      void loadPose();
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setStatus('denied');
    }
  };

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopSpeaking();
  }, []);

  const endSession = () => {
    cleanup();
    setStatus('ended');
    const mins = Math.max(1, Math.round(elapsed / 60));
    speak(`Session complete. ${reps} reps logged. Well done.`);
    add.mutate({ focus: `Trainer Mode — ${exercise.label}`, minutes: mins, intensity: 'moderate', note: `${reps} reps, guided session` });
  };

  useEffect(() => cleanup, [cleanup]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const phaseLabel = PHASES.find((p) => p.key === phase)?.label ?? '';

  // ── render ──
  if (status === 'idle' || status === 'starting') {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
        <div className="eyebrow">Fitness · Trainer Mode</div>
        <h1 style={{ fontSize: 26 }}>Live AI form coach</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
          Turn on your camera and I'll watch your movement, count your reps and call out form and posture
          corrections by voice — a guided {SESSION_MIN}-minute session. Your video stays on your device.
        </p>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow">Choose your exercise</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {EXERCISES.map((e) => (
              <button key={e.key} type="button" onClick={() => setExercise(e)}
                style={{ cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  border: '1.5px solid var(--line)', background: exercise.key === e.key ? 'var(--accent)' : 'transparent', color: exercise.key === e.key ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
                {e.label}
              </button>
            ))}
          </div>
          <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--muted)' }}>
            <li>Stand ~2–3 m back so your whole body is visible.</li>
            <li>Voice coaching {speechSupported() ? 'is on' : 'is unavailable in this browser'} — you'll hear rep counts and cues.</li>
            <li>Camera and pose analysis run entirely on your device.</li>
          </ul>
        </div>
        <Button variant="accent" onClick={() => void start()} disabled={status === 'starting'}>
          {status === 'starting' ? 'Requesting camera…' : `🎥 Start ${exercise.label} session`}
        </Button>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
        <div className="eyebrow">Fitness · Trainer Mode</div>
        <h1 style={{ fontSize: 26 }}>Camera needed</h1>
        <div className="card" style={{ marginTop: 14, borderLeft: '4px solid var(--warn-ink)' }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            I couldn't access your camera. Allow camera access in your browser's address bar and try again —
            the video is processed locally and never uploaded.
          </p>
          <div style={{ marginTop: 12 }}><Button variant="accent" size="sm" onClick={() => setStatus('idle')}>Try again</Button></div>
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <h1 style={{ fontSize: 26 }}>Session complete</h1>
        <p className="muted" style={{ fontSize: 14 }}>{exercise.label} · {mm}:{ss} · <strong>{reps} reps</strong> — logged to your activity.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
          <Button variant="accent" onClick={() => setStatus('idle')}>New session</Button>
        </div>
      </div>
    );
  }

  // live
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{phaseLabel}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 18 }}>{mm}:{ss}</span>
        <span className="muted" style={{ fontSize: 12 }}>/ {SESSION_MIN}:00</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => setMuted((m) => !m)}>{muted ? '🔇 Unmute' : '🔊 Voice on'}</Button>
          <Button variant="line" size="sm" onClick={endSession}>End session</Button>
        </div>
      </div>

      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--media-bg)', aspectRatio: '4 / 3' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }} />
        <div style={{ position: 'absolute', left: 14, top: 14, background: 'rgba(0,0,0,.55)', color: 'var(--on-accent)', borderRadius: 12, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, opacity: .8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{exercise.label} reps</div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{reps}</div>
        </div>
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, background: 'rgba(0,0,0,.6)', color: 'var(--on-accent)', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600 }}>
          {feedback}
        </div>
        {!poseReady && !poseError && (
          <div style={{ position: 'absolute', right: 14, top: 14, background: 'rgba(0,0,0,.55)', color: 'var(--on-accent)', borderRadius: 10, padding: '6px 10px', fontSize: 11.5 }}>Loading pose model…</div>
        )}
        {poseError && (
          <div style={{ position: 'absolute', right: 14, top: 14, background: 'rgba(230,81,0,.85)', color: 'var(--on-accent)', borderRadius: 10, padding: '6px 10px', fontSize: 11.5, maxWidth: 220 }}>
            Pose detection unavailable — running as a timed, voice-guided session.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {EXERCISES.map((e) => (
          <button key={e.key} type="button" onClick={() => { setExercise(e); repState.current = 'up'; speak(`Switching to ${e.label}s.`); }}
            style={{ cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              border: '1.5px solid var(--line)', background: exercise.key === e.key ? 'var(--accent)' : 'transparent', color: exercise.key === e.key ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
            {e.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
        Educational form guidance, not a medical or professional-coaching service. Stop if you feel pain,
        dizziness or chest symptoms.
      </p>
    </div>
  );
}
