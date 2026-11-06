import { z } from 'zod';

import { fitWindow, roundTenth } from './timeline';

/**
 * Every setting the operator can change, with its limits and default. Stored as one JSON document.
 * Each field falls back to its own default (`.catch`), so a value from an older version or a damaged store
 * resets only itself, never the whole document.
 */

export const LIMITS = {
  countdownS: { min: 0, max: 10, step: 1 },
  recordS: { min: 2, max: 20, step: 0.5 },
  slowmoStartS: { step: 0.5, dragStep: 0.1 },
  slowmoDurationS: { step: 0.5, dragStep: 0.1 },
} as const;

export const AUTO_START_CHOICES = [0, 3, 5, 10] as const;
export const IDLE_RETURN_CHOICES = [0, 30, 60, 120] as const;
export const LINK_EXPIRY_CHOICES = [7, 30, 90] as const;

/** A time in seconds: out-of-range values are pulled into range, anything that is not a number resets. */
const seconds = (min: number, max: number, fallback: number) =>
  z
    .number()
    .transform((v) => roundTenth(Math.min(Math.max(v, min), max)))
    .catch(fallback);

const oneOf = <const T extends readonly number[]>(choices: T, fallback: T[number]) =>
  z.literal(choices).catch(fallback);

export const QUALITY = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITY)[number];

const preset = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
});
export type Preset = z.infer<typeof preset>;

const cameraPrefs = z.object({
  /** A lens id reported by the camera, or null for the standard wide lens. */
  lensId: z.string().nullable().catch(null),
  /** null = the best slow-motion preset at 1080p, chosen on the device. */
  preset: preset.nullable().catch(null),
  quality: z.enum(QUALITY).catch('high'),
  stabilization: z.enum(['off', 'standard']).catch('off'),
  mirror: z.boolean().catch(false),
});
export type CameraPrefs = z.infer<typeof cameraPrefs>;

const recording = z.object({
  countdownS: seconds(LIMITS.countdownS.min, LIMITS.countdownS.max, 3),
  recordS: seconds(LIMITS.recordS.min, LIMITS.recordS.max, 10),
  slowmoStartS: seconds(0, LIMITS.recordS.max, 3),
  slowmoDurationS: seconds(0, LIMITS.recordS.max, 3),
  reverse: z.boolean().catch(true),
  autoStartS: oneOf(AUTO_START_CHOICES, 0),
  tapAnywhere: z.boolean().catch(true),
  countdownBeep: z.boolean().catch(false),
  showFrameOnCamera: z.boolean().catch(true),
});

export const settingsSchema = z
  .object({
    recording: recording.catch(() => recording.parse({})),
    camera: z
      .object({
        position: z.enum(['back', 'front']).catch('back'),
        back: cameraPrefs.catch(() => cameraPrefs.parse({})),
        front: cameraPrefs.catch(() => cameraPrefs.parse({})),
      })
      .catch(() => ({
        position: 'back' as const,
        back: cameraPrefs.parse({}),
        front: cameraPrefs.parse({}),
      })),
    output: z.object({ size: z.enum(['1080p', '720p']).catch('1080p') }).catch({ size: '1080p' as const }),
    look: z
      .object({ overlayId: z.string().nullable().catch(null), trackId: z.string().nullable().catch(null) })
      .catch({ overlayId: null, trackId: null }),
    storage: z
      .object({ saveOriginals: z.boolean().catch(true), autoSaveToPhotos: z.boolean().catch(false) })
      .catch({ saveOriginals: true, autoSaveToPhotos: false }),
    booth: z.object({ idleReturnS: oneOf(IDLE_RETURN_CHOICES, 60) }).catch({ idleReturnS: 60 }),
    sharing: z
      .object({
        enabled: z.boolean().catch(false),
        linkExpiryDays: oneOf(LINK_EXPIRY_CHOICES, 30),
        wifiOnly: z.boolean().catch(false),
        showQrAfterTake: z.boolean().catch(true),
      })
      .catch({ enabled: false, linkExpiryDays: 30, wifiOnly: false, showQrAfterTake: true }),
    onboardingDone: z.boolean().catch(false),
  })
  // The slow-motion window must sit inside the take, whatever was stored.
  .transform((s) => ({
    ...s,
    recording: { ...s.recording, ...fitWindow(s.recording, s.recording.recordS) },
  }));

export type Settings = z.output<typeof settingsSchema>;
export type RecordingSettings = Settings['recording'];

/** Parses anything (stored JSON, `undefined`) into complete, valid settings. Never throws. */
export function parseSettings(input: unknown): Settings {
  const result = settingsSchema.safeParse(input ?? {});
  return result.success ? result.data : settingsSchema.parse({});
}

export const DEFAULT_SETTINGS: Settings = parseSettings({});
