import type { Quality } from './settings';

/**
 * Recording bitrate for a preset, in bits per second.
 *
 * HEVC needs roughly 0.07 bits per pixel per frame for clean motion at booth distances; 1080p at 240 fps gets
 * about 35 Mbps, 4K at 60 fps about 35 Mbps, 720p at 60 fps about 4 Mbps. High adds headroom for fast spins
 * (the whole frame moves every frame), Low trims it for long events on small phones. A floor keeps low frame
 * rates from turning to mush; a ceiling stays inside what iPhones encode in real time.
 */
const BITS_PER_PIXEL_FRAME = 0.07;
const QUALITY_FACTOR: Record<Quality, number> = { low: 0.6, medium: 1, high: 1.5 };
const MIN_BPS = 4e6;
const MAX_BPS = 100e6;

export function recordingBitrate(width: number, height: number, fps: number, quality: Quality): number {
  const raw = width * height * fps * BITS_PER_PIXEL_FRAME * QUALITY_FACTOR[quality];
  return Math.round(Math.min(MAX_BPS, Math.max(MIN_BPS, raw)));
}
