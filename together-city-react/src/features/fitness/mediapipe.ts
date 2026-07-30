/**
 * The slice of MediaPipe Tasks Vision this app actually touches.
 *
 * The library is loaded from a CDN at runtime (`import(MP_URL)`) rather than
 * installed, so no types come with it — which is why every landmark in the
 * trainer used to be `any`, and why reading `.x` off one told TypeScript
 * nothing. Forty-four of this codebase's lint errors lived in that one file.
 *
 * Declaring the surface here rather than installing @mediapipe/tasks-vision is
 * deliberate: the package is several megabytes, the app deliberately loads it
 * lazily so that a citizen who never opens the trainer never pays for it, and
 * pulling it in as a dependency purely for types would undo that.
 *
 * The trade-off is honest and worth naming: these types are a promise about a
 * remote library, not a fact checked against it. If MediaPipe changes shape,
 * TypeScript will keep agreeing with this file and the failure will show up at
 * runtime. That is why `loadPose` treats any failure as "run without pose
 * detection" instead of trusting the import to have worked.
 */

/** One normalised pose landmark: 0..1 within the frame. */
export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseResult {
  /** One array per detected person; the trainer asks for a single pose. */
  landmarks?: PoseLandmark[][];
}

export interface PoseLandmarker {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseResult;
  close?(): void;
}

export interface PoseLandmarkerOptions {
  baseOptions: { modelAssetPath: string; delegate?: 'GPU' | 'CPU' };
  runningMode: 'VIDEO' | 'IMAGE';
  numPoses?: number;
}

/** The two entry points used from the CDN module. */
export interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmRoot: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(fileset: unknown, options: PoseLandmarkerOptions): Promise<PoseLandmarker>;
  };
}
