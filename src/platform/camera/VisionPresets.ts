import { useEffect, useState } from 'react';
import { VisionCamera, useCameraDevices, type CameraDevice } from 'react-native-vision-camera';

import type { Preset } from '@/domain/settings';

import { PRESET_FPS, PRESET_RESOLUTIONS, pickDevice, targetSize } from './devices';

/**
 * Every resolution × frame rate this lens can actually record, largest first. Each pair is checked with the
 * camera's own negotiation (resolution first, then frame rate, as the booth camera configures it), because a
 * lens that does 240 fps at 720p often cannot at 1080p and the device's overall fps range does not say so.
 */
export async function probePresets(device: CameraDevice): Promise<Preset[]> {
  const sizes = device.getSupportedResolutions('video');
  const has = (w: number, h: number) =>
    sizes.some((s) => Math.max(s.width, s.height) === w && Math.min(s.width, s.height) === h);

  const presets: Preset[] = [];
  for (const resolution of PRESET_RESOLUTIONS) {
    if (!has(resolution.width, resolution.height)) continue;
    const output = VisionCamera.createVideoOutput({
      targetResolution: targetSize(resolution),
      enableAudio: false,
    });
    for (const fps of PRESET_FPS) {
      if (!device.supportsFPS(fps)) continue;
      const config = await VisionCamera.resolveConstraints(
        device,
        [{ output, mirrorMode: 'auto' }],
        [{ resolutionBias: output }, { fps }],
      );
      if ((config.selectedFPS ?? 0) >= fps - 0.5)
        presets.push({ width: resolution.width, height: resolution.height, fps });
    }
  }
  return presets;
}

export function useVisionPresets(
  position: 'back' | 'front',
  lensId: string | null,
): { presets: Preset[] | null; error: string | null } {
  const devices = useCameraDevices();
  const device = pickDevice(devices, position, lensId);
  const [result, setResult] = useState<{
    deviceId: string;
    presets: Preset[] | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!device) return;
    let alive = true;
    probePresets(device).then(
      (presets) => alive && setResult({ deviceId: device.id, presets, error: null }),
      (error: unknown) =>
        alive &&
        setResult({
          deviceId: device.id,
          presets: null,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      alive = false;
    };
  }, [device]);

  if (!device) return { presets: [], error: 'No camera found on this side of the phone.' };
  if (!result || result.deviceId !== device.id) return { presets: null, error: null };
  return { presets: result.presets, error: result.error };
}
