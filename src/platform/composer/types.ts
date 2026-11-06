import type { Segment } from '@/domain/timeline';

/**
 * One video to make. Paths are absolute filesystem paths (no `file://`). The engine executes `segments` and
 * `reverse` exactly as `src/domain/timeline.ts` planned them; it makes no timing decisions of its own.
 */
export type ComposeRequest = {
  jobId: string;
  inputPath: string;
  outputPath: string;
  segments: Segment[];
  reverse: boolean;
  outputFps: number;
  /** Portrait output size, e.g. 1080 × 1920. The source is scaled to fill it and centre-cropped. */
  width: number;
  height: number;
  /** H.264 bitrate of the final video, bits per second. */
  bitrate: number;
  /** A PNG with transparency, drawn over every frame, scaled to fill. */
  overlayPath: string | null;
  /** Music for the whole video, trimmed to its length with a fade-out. */
  audioPath: string | null;
  audioStartS: number;
  audioFadeOutS: number;
  /** Flip horizontally (front camera "Mirror video"). */
  mirror: boolean;
};

export type ComposeResult = {
  /** Where the video actually is; the Expo Go stand-in keeps the original's container. */
  outputPath: string;
  durationS: number;
  bytes: number;
};

export type Composer = {
  /** True for the real engine; false for the stand-in, which copies the clip without slow motion or reverse. */
  readonly isReal: boolean;
  compose(request: ComposeRequest, onProgress: (fraction: number) => void): Promise<ComposeResult>;
  cancel(jobId: string): void;
};
