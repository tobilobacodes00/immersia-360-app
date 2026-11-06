/**
 * The one place that decides how a recorded take becomes the final video.
 *
 * The final video always plays at OUTPUT_FPS. A clip recorded at `fps` holds fps/OUTPUT_FPS times more frames
 * per second than playback needs, so the slow-motion window is stretched by that factor and every recorded
 * frame is shown: 240 fps gives 8x slow motion, 60 fps gives 2x, 30 fps gives none. With `reverse` on, the whole
 * forward video is followed by itself played backwards.
 *
 * The settings screen (final length), the capture screen (slow-motion arc on the progress ring) and the native
 * video engine all read the same `Plan`, so they cannot disagree. The engine only executes `segments`.
 */

export const OUTPUT_FPS = 30;

/** Smallest window that counts as slow motion; below this the window is dropped. */
const MIN_SEGMENT_S = 1 / OUTPUT_FPS;

export type TimelineSettings = {
  /** Planned take length in seconds. */
  recordS: number;
  slowmoStartS: number;
  /** 0 turns slow motion off. */
  slowmoDurationS: number;
  reverse: boolean;
};

export type Segment = {
  /** Source time range in seconds, in the recorded clip. */
  srcStartS: number;
  srcEndS: number;
  /** How many times longer this range plays than it was recorded: 1 = real time, 8 = 8x slow motion. */
  stretch: number;
};

export type Plan = {
  segments: Segment[];
  reverse: boolean;
  outputFps: number;
  /** Length of the forward part alone. */
  forwardS: number;
  /** Length of the final video, forward plus reverse. */
  totalS: number;
};

/** How much a clip recorded at `fps` can be slowed down while still showing a new frame on every output frame. */
export function slowFactor(fps: number): number {
  return Math.max(1, fps / OUTPUT_FPS);
}

/**
 * Builds the plan for a take.
 *
 * @param fps frame rate the take was (or will be) recorded at.
 * @param takeS actual length of the recording, if it is known and shorter than planned (a manual early stop).
 */
export function buildPlan(settings: TimelineSettings, fps: number, takeS?: number): Plan {
  const length = Math.max(0, takeS === undefined ? settings.recordS : Math.min(settings.recordS, takeS));
  const factor = slowFactor(fps);

  const start = clamp(settings.slowmoStartS, 0, length);
  const end = clamp(settings.slowmoStartS + settings.slowmoDurationS, start, length);
  const hasSlowmo = factor > 1 && end - start >= MIN_SEGMENT_S;

  const segments: Segment[] = [];
  const push = (srcStartS: number, srcEndS: number, stretch: number) => {
    if (srcEndS - srcStartS < MIN_SEGMENT_S) return;
    const last = segments[segments.length - 1];
    // Merge neighbours at the same speed so the engine never cuts where nothing changes.
    if (last && last.stretch === stretch && Math.abs(last.srcEndS - srcStartS) < 1e-9) last.srcEndS = srcEndS;
    else segments.push({ srcStartS, srcEndS, stretch });
  };

  if (hasSlowmo) {
    push(0, start, 1);
    push(start, end, factor);
    push(end, length, 1);
  } else {
    push(0, length, 1);
  }

  const forwardS = segments.reduce((sum, s) => sum + (s.srcEndS - s.srcStartS) * s.stretch, 0);
  return {
    segments,
    reverse: settings.reverse,
    outputFps: OUTPUT_FPS,
    forwardS,
    totalS: settings.reverse ? forwardS * 2 : forwardS,
  };
}

/** Final video length for a frame rate, without building segments: the formula the settings screen shows. */
export function finalLengthS(settings: TimelineSettings, fps: number): number {
  return buildPlan(settings, fps).totalS;
}

/** "0:46", "1:22", "12:05". Rounded to the nearest second, as the length readout is. */
export function formatLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type SlowmoWindow = { slowmoStartS: number; slowmoDurationS: number };

/**
 * Keeps the slow-motion window inside the take after the take length changes: the window moves left first and
 * only shrinks when it no longer fits. A window that already fits is left exactly as it is.
 */
export function fitWindow(window: SlowmoWindow, recordS: number): SlowmoWindow {
  const duration = clamp(window.slowmoDurationS, 0, recordS);
  const start = clamp(window.slowmoStartS, 0, recordS - duration);
  return { slowmoStartS: roundTenth(start), slowmoDurationS: roundTenth(duration) };
}

/** Settings values are stored to a tenth of a second; this removes floating-point dust (0.30000000000000004). */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
